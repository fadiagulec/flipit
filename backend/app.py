from flask import Flask, request, jsonify, g
from flask_cors import CORS
import subprocess, os, tempfile, base64, json, glob, time, threading, signal as _signal
from urllib.parse import urlparse

try:
    import instaloader
    from instaloader.exceptions import (
        ConnectionException,
        LoginRequiredException,
        InvalidArgumentException,
        QueryReturnedNotFoundException,
        ProfileNotExistsException,
    )
    # IPSWatchdogException only exists on newer instaloader versions; fall
    # back to a stub class so isinstance() checks don't blow up on older deps.
    try:
        from instaloader.exceptions import IPSWatchdogException  # type: ignore
    except Exception:
        class IPSWatchdogException(Exception):  # noqa: N818
            pass
    INSTALOADER_AVAILABLE = True
except Exception as _e:  # pragma: no cover — instaloader missing locally
    INSTALOADER_AVAILABLE = False
    instaloader = None
    ConnectionException = LoginRequiredException = InvalidArgumentException = Exception
    QueryReturnedNotFoundException = ProfileNotExistsException = Exception
    class IPSWatchdogException(Exception):  # noqa: N818
        pass

app = Flask(__name__)
CORS(app)

# ── Instaloader config ────────────────────────────────────────────────
# Anonymous, metadata-only mode. We never log in (account-ban risk) and
# never download media (we only need URLs/captions/counts).
_LOADER = None
_LOADER_LOCK = threading.Lock()

def get_loader():
    """Lazily build a shared anonymous Instaloader instance."""
    global _LOADER
    if not INSTALOADER_AVAILABLE:
        return None
    if _LOADER is None:
        with _LOADER_LOCK:
            if _LOADER is None:
                _LOADER = instaloader.Instaloader(
                    quiet=True,
                    download_pictures=False,
                    download_videos=False,
                    download_video_thumbnails=False,
                    download_geotags=False,
                    download_comments=False,
                    save_metadata=False,
                    post_metadata_txt_pattern='',
                    # One polite request delay between calls — Instaloader has
                    # adaptive throttling; this just caps minimum spacing.
                    request_timeout=15.0,
                    max_connection_attempts=1,
                )
    return _LOADER

# ── In-memory cache (30 min TTL) ──────────────────────────────────────
# Railway processes are persistent so a plain dict survives across requests.
# Key: ('posts'|'post'|'hashtag'|'search', identifier, limit). Value: (expires_at, payload).
_CACHE = {}
_CACHE_LOCK = threading.Lock()
CACHE_TTL_SEC = 30 * 60

def cache_get(key):
    with _CACHE_LOCK:
        entry = _CACHE.get(key)
        if not entry:
            return None
        expires_at, payload = entry
        if time.time() > expires_at:
            _CACHE.pop(key, None)
            return None
        return payload

def cache_set(key, payload):
    with _CACHE_LOCK:
        _CACHE[key] = (time.time() + CACHE_TTL_SEC, payload)
        # Light bound: if cache balloons, drop oldest 25%.
        if len(_CACHE) > 500:
            stale = sorted(_CACHE.items(), key=lambda kv: kv[1][0])[:125]
            for k, _ in stale:
                _CACHE.pop(k, None)

# ── Per-request 60s wall-clock guard ──────────────────────────────────
# Instaloader can hang on auth challenges even with request_timeout set.
# We stamp a deadline on g and check it inside the scrape loops, plus a
# best-effort thread-based timeout wrapper for individual blocking calls.
REQUEST_DEADLINE_SEC = 60

@app.before_request
def _stamp_deadline():
    g.deadline = time.time() + REQUEST_DEADLINE_SEC

def _deadline_exceeded():
    return time.time() > getattr(g, 'deadline', float('inf'))

def _run_with_timeout(fn, timeout_sec=15):
    """Run fn() in a worker thread; return (ok, value_or_exc). On timeout
    returns (False, TimeoutError(...)). The worker keeps running in the
    background but we stop waiting — Instaloader requests will themselves
    time out via request_timeout=15."""
    result = {}

    def _target():
        try:
            result['value'] = fn()
        except BaseException as e:  # noqa: BLE001
            result['error'] = e

    t = threading.Thread(target=_target, daemon=True)
    t.start()
    t.join(timeout_sec)
    if t.is_alive():
        return False, TimeoutError(f'Instaloader call exceeded {timeout_sec}s')
    if 'error' in result:
        return False, result['error']
    return True, result.get('value')

# ── Response shaping helpers ──────────────────────────────────────────
def _post_to_browse_dict(post):
    """Map an Instaloader Post → the shape instagram-browse.js expects.

    Consumer (Netlify) wants:
      { url, thumbnail, caption, owner, likes, comments, isVideo, isCarousel, postedAt? }
    """
    try:
        shortcode = getattr(post, 'shortcode', None) or ''
        url = f'https://www.instagram.com/p/{shortcode}/' if shortcode else None
        if not url:
            return None

        thumbnail = getattr(post, 'url', None) or getattr(post, 'display_url', None)
        # Some Instaloader builds expose display_resources; fall back to first.
        if not thumbnail:
            res = getattr(post, 'display_resources', None) or []
            if res and isinstance(res, list):
                thumbnail = res[0].get('src') if isinstance(res[0], dict) else None

        caption = getattr(post, 'caption', None) or ''
        if isinstance(caption, str):
            caption = caption[:200]
        else:
            caption = ''

        owner_username = getattr(post, 'owner_username', None) or ''
        owner = f'@{owner_username}' if owner_username else ''

        likes = int(getattr(post, 'likes', 0) or 0)
        comments = int(getattr(post, 'comments', 0) or 0)

        is_video = bool(getattr(post, 'is_video', False))
        typename = getattr(post, 'typename', '') or ''
        # GraphSidecar = carousel; mediacount > 1 also indicates carousel.
        media_count = int(getattr(post, 'mediacount', 1) or 1)
        is_carousel = typename == 'GraphSidecar' or media_count > 1

        out = {
            'url': url,
            'thumbnail': thumbnail if isinstance(thumbnail, str) and thumbnail.startswith('http') else None,
            'caption': caption,
            'owner': owner,
            'likes': likes,
            'comments': comments,
            'isVideo': is_video,
            'isCarousel': is_carousel,
        }

        posted_at = getattr(post, 'date_utc', None) or getattr(post, 'date', None)
        if posted_at is not None:
            try:
                out['postedAt'] = posted_at.isoformat() + ('Z' if posted_at.tzinfo is None else '')
            except Exception:
                pass

        return out
    except Exception:
        return None

def _post_to_single_dict(post):
    """Map an Instaloader Post → the shape extract-and-twist.js expects.

    Consumer reads: caption, ownerUsername, displayUrl, images[], childPosts[].displayUrl.
    We return both flat and Apify-equivalent keys so the existing normalizer paths work.
    """
    try:
        owner_username = getattr(post, 'owner_username', None) or ''
        caption = getattr(post, 'caption', None) or ''
        display_url = getattr(post, 'url', None) or getattr(post, 'display_url', None) or ''
        is_video = bool(getattr(post, 'is_video', False))

        images = []
        if isinstance(display_url, str) and display_url.startswith('http'):
            images.append(display_url)

        # Sidecar / carousel: walk get_sidecar_nodes() for each child image URL.
        try:
            if getattr(post, 'typename', '') == 'GraphSidecar':
                for node in post.get_sidecar_nodes():
                    node_url = getattr(node, 'display_url', None)
                    if isinstance(node_url, str) and node_url.startswith('http') and node_url not in images:
                        images.append(node_url)
        except Exception:
            pass

        return {
            'caption': caption if isinstance(caption, str) else '',
            'owner': owner_username,
            'ownerUsername': owner_username,
            'displayUrl': display_url,
            'images': images,
            'isVideo': is_video,
        }
    except Exception:
        return None

def _blocked_response():
    return jsonify({'error': 'blocked'}), 503

def _is_blocked_exception(e):
    if isinstance(e, (ConnectionException, LoginRequiredException, InvalidArgumentException, IPSWatchdogException)):
        return True
    # Heuristic for older instaloader builds whose exception classes don't subclass cleanly.
    msg = str(e).lower()
    return ('login' in msg and 'required' in msg) or '401' in msg or '403' in msg or 'checkpoint' in msg

# ── Existing yt-dlp download endpoint (unchanged) ─────────────────────
@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'instaloader': INSTALOADER_AVAILABLE})

@app.route('/download', methods=['POST', 'OPTIONS'])
def download():
    if request.method == 'OPTIONS':
        return '', 200

    data = request.get_json(silent=True) or {}
    url = (data.get('url') or '').strip()
    if not url:
        return jsonify({'error': 'Missing url'}), 400

    # Optional: crop the burned-in Instagram username/handle watermark off the
    # bottom of the downloaded clip. We crop ~7% off the bottom which catches
    # the IG share-overlay across phone resolutions (it ranges 50–80px on a
    # 1920px-tall Reel) without losing meaningful content.
    remove_watermark = bool(data.get('remove_watermark'))

    with tempfile.TemporaryDirectory() as tmpdir:
        out_tmpl = os.path.join(tmpdir, 'video.%(ext)s')

        def run_ytdlp(extra_args=[]):
            # NOTE: --impersonate chrome was removed because the chrome target
            # isn't always registered in curl-cffi at runtime (depends on
            # version + extras). Falling back to a plain User-Agent header
            # works for the vast majority of cases. Re-add impersonation only
            # after pinning curl-cffi to a version with chrome bundled.
            cmd = [
                'yt-dlp',
                '--no-playlist',
                '--max-filesize', '50m',
                '--socket-timeout', '30',
                '--output', out_tmpl,
                '--add-header', 'User-Agent:Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            ] + extra_args + [url]
            return subprocess.run(cmd, capture_output=True, text=True, timeout=60)

        # Try 1: no cookies (works for TikTok, YouTube, Twitter)
        result = run_ytdlp()

        # Try 2: if Instagram failed, try with cookies env var
        if result.returncode != 0 and 'instagram' in url.lower():
            cookies_b64 = os.environ.get('INSTAGRAM_COOKIES_B64', '')
            if cookies_b64:
                try:
                    cookies_path = os.path.join(tmpdir, 'cookies.txt')
                    with open(cookies_path, 'wb') as f:
                        f.write(base64.b64decode(cookies_b64))
                    result = run_ytdlp(['--cookies', cookies_path])
                except Exception as e:
                    pass

        if result.returncode != 0:
            err = result.stderr[-300:] if result.stderr else 'Unknown error'
            if 'login' in err.lower() or 'authentication' in err.lower():
                return jsonify({'error': 'Instagram requires login. Set INSTAGRAM_COOKIES_B64 in Railway env vars.', 'success': False}), 400
            return jsonify({'error': err, 'success': False}), 400

        # Find downloaded file
        files = glob.glob(os.path.join(tmpdir, 'video.*'))
        if not files:
            return jsonify({'error': 'No file downloaded', 'success': False}), 500

        filepath = files[0]
        ext = os.path.splitext(filepath)[1]

        # Optional watermark crop. Bottom 7% covers the IG share-overlay
        # (username + IG bird) across phone resolutions without losing
        # meaningful content. Falls through silently on failure — better
        # to deliver the watermarked video than fail the request entirely.
        # Errors are logged to stderr so Railway log search reveals whether
        # ffmpeg is missing vs a real ffmpeg failure.
        watermark_removed = False
        if remove_watermark and ext.lower() in ('.mp4', '.mov', '.webm'):
            cropped_path = os.path.join(tmpdir, 'cropped' + ext)
            try:
                ff = subprocess.run(
                    [
                        'ffmpeg', '-y',
                        '-i', filepath,
                        '-vf', 'crop=iw:ih*0.93:0:0',
                        '-c:v', 'libx264',
                        '-preset', 'veryfast',
                        '-crf', '23',
                        '-c:a', 'copy',
                        '-movflags', '+faststart',
                        cropped_path,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=20,
                )
                if ff.returncode == 0 and os.path.exists(cropped_path) and os.path.getsize(cropped_path) > 1024:
                    filepath = cropped_path
                    watermark_removed = True
                else:
                    print(f'[watermark] ffmpeg rc={ff.returncode} stderr={(ff.stderr or "")[-300:]}', flush=True)
            except FileNotFoundError:
                print('[watermark] ffmpeg binary not installed in container', flush=True)
            except Exception as e:
                print(f'[watermark] ffmpeg error: {e}', flush=True)

        size_mb = os.path.getsize(filepath) / (1024 * 1024)

        with open(filepath, 'rb') as f:
            video_b64 = base64.b64encode(f.read()).decode('utf-8')

        return jsonify({
            'success': True,
            'videoData': video_b64,
            'ext': ext,
            'size_mb': round(size_mb, 2),
            'watermark_removed': watermark_removed,
        })


@app.route('/prepare-eraser', methods=['POST', 'OPTIONS'])
def prepare_eraser():
    """Transcode any uploaded video to H.264 MP4 so it actually previews in
    the browser. iPhone .mov files are HEVC, which Safari plays but Chrome
    desktop / Firefox refuse to decode in a <video> tag — leaving the eraser
    modal black. By re-encoding here, the user gets a usable preview no
    matter what format they uploaded.

    Request:  POST { videoData: base64 }
    Response: { success, videoData (base64 H.264 MP4), size_mb }
    """
    if request.method == 'OPTIONS':
        return '', 200

    data = request.get_json(silent=True) or {}
    video_b64 = (data.get('videoData') or '').strip()
    if not video_b64:
        return jsonify({'error': 'Missing videoData'}), 400
    if len(video_b64) > 25 * 1024 * 1024:
        return jsonify({'error': 'Video too large (max ~18MB)'}), 413

    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            video_bytes = base64.b64decode(video_b64, validate=False)
        except Exception:
            return jsonify({'error': 'Invalid base64'}), 400
        if len(video_bytes) < 1024:
            return jsonify({'error': 'Video data too small'}), 400

        in_path = os.path.join(tmpdir, 'in.bin')
        out_path = os.path.join(tmpdir, 'out.mp4')
        with open(in_path, 'wb') as f:
            f.write(video_bytes)

        try:
            ff = subprocess.run(
                [
                    'ffmpeg', '-y', '-i', in_path,
                    # Force H.264 baseline-ish profile for max browser
                    # compatibility. veryfast keeps the transcode under ~10s
                    # for typical Reel-length clips.
                    '-c:v', 'libx264',
                    '-profile:v', 'high',
                    '-pix_fmt', 'yuv420p',
                    '-preset', 'veryfast',
                    '-crf', '23',
                    # If incoming audio is AAC we copy, otherwise re-encode
                    # so the MP4 muxer doesn't choke on weird audio codecs.
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    # Faststart lets the <video> element seek before the full
                    # file downloads — important for the auto-seek-to-frame-0
                    # behaviour in the eraser modal.
                    '-movflags', '+faststart',
                    out_path,
                ],
                capture_output=True, text=True, timeout=45
            )
            if ff.returncode != 0:
                print(f'[prepare] ffmpeg failed rc={ff.returncode} stderr={(ff.stderr or "")[-300:]}', flush=True)
                return jsonify({'error': 'Transcode failed', 'detail': (ff.stderr or '')[-200:]}), 500
        except FileNotFoundError:
            return jsonify({'error': 'ffmpeg not installed'}), 500
        except subprocess.TimeoutExpired:
            return jsonify({'error': 'Transcode timed out (try a shorter clip)'}), 408

        if not os.path.exists(out_path) or os.path.getsize(out_path) < 1024:
            return jsonify({'error': 'Transcode produced empty output'}), 500

        with open(out_path, 'rb') as f:
            out_b64 = base64.b64encode(f.read()).decode('utf-8')

        return jsonify({
            'success': True,
            'videoData': out_b64,
            'mime': 'video/mp4',
            'ext': '.mp4',
            'size_mb': round(os.path.getsize(out_path) / (1024 * 1024), 2),
        })


@app.route('/erase-region', methods=['POST', 'OPTIONS'])
def erase_region():
    """Erase user-selected rectangular regions from an already-downloaded
    video using ffmpeg's delogo filter, which interpolates surrounding pixels
    over the box for every frame. Best for static overlays (burned-in handles,
    logos, captions in fixed positions). Not a true AI inpaint.

    Request body:
      videoData: base64 string of the original video (.mp4 / .mov / .webm)
      regions:   list of {x, y, w, h} where each is a 0–1 fraction of the
                 frame (so 0.05/0.85/0.20/0.06 means: 5% from left, 85% from
                 top, 20% wide, 6% tall). Max 5 regions.

    Returns: { success, videoData (base64), size_mb, regions_applied }
    """
    if request.method == 'OPTIONS':
        return '', 200

    data = request.get_json(silent=True) or {}
    video_b64 = (data.get('videoData') or '').strip()
    regions = data.get('regions') or []

    if not video_b64:
        return jsonify({'error': 'Missing videoData'}), 400
    if not isinstance(regions, list) or not regions:
        return jsonify({'error': 'Missing regions list'}), 400

    # Bound input size — 25MB base64 ≈ 18MB binary. Anything larger should
    # have been rejected by the upstream Netlify proxy already.
    if len(video_b64) > 25 * 1024 * 1024:
        return jsonify({'error': 'Video too large (max ~18MB)'}), 413

    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            video_bytes = base64.b64decode(video_b64, validate=False)
        except Exception:
            return jsonify({'error': 'Invalid base64'}), 400
        if len(video_bytes) < 1024:
            return jsonify({'error': 'Video data too small'}), 400

        in_path = os.path.join(tmpdir, 'in.mp4')
        out_path = os.path.join(tmpdir, 'out.mp4')
        with open(in_path, 'wb') as f:
            f.write(video_bytes)

        # Probe frame dimensions so we can convert each 0–1 region to pixels.
        try:
            probe = subprocess.run(
                ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                 '-show_entries', 'stream=width,height', '-of', 'csv=p=0',
                 in_path],
                capture_output=True, text=True, timeout=10
            )
            if probe.returncode != 0:
                return jsonify({'error': 'Could not read video metadata'}), 400
            dims = probe.stdout.strip().split(',')
            vw, vh = int(dims[0]), int(dims[1])
        except Exception as e:
            return jsonify({'error': f'Probe failed: {e}'}), 500

        # Build the delogo filter chain. delogo requires the bounding box to
        # have at least 1px margin from the frame edge — clamp accordingly.
        # Cap at 5 regions so a malicious request can't pile up filters.
        #
        # We expand the user-drawn box by PAD px each side. Users almost always
        # under-draw — they cover the visible glyphs but miss the faint outline
        # / drop-shadow / antialiased edge, which is what shows up as a "stain"
        # in the output. Padding sweeps that fringe into the interpolated zone.
        #
        # band=N controls how many pixels around the rect get 50%-blended
        # instead of fully synthesized. Default is 4. Raising it makes the
        # edges blend more naturally into the surrounding texture, which kills
        # the visible seam that causes the smudge.
        PAD = 8
        BAND_TARGET = 12
        filters = []
        for r in regions[:5]:
            try:
                rx = int(float(r.get('x', 0)) * vw)
                ry = int(float(r.get('y', 0)) * vh)
                rw = int(float(r.get('w', 0)) * vw)
                rh = int(float(r.get('h', 0)) * vh)
            except (TypeError, ValueError):
                continue
            # Expand by PAD on each side, then clamp inside frame.
            rx -= PAD; ry -= PAD; rw += 2 * PAD; rh += 2 * PAD
            rx = max(1, min(rx, vw - 3))
            ry = max(1, min(ry, vh - 3))
            rw = max(2, min(rw, vw - rx - 1))
            rh = max(2, min(rh, vh - ry - 1))
            if rw >= 2 and rh >= 2:
                # delogo caps band at min(w,h)//2 - 1; honor that.
                band = max(1, min(BAND_TARGET, min(rw, rh) // 2 - 1))
                filters.append(f'delogo=x={rx}:y={ry}:w={rw}:h={rh}:band={band}')

        if not filters:
            return jsonify({'error': 'No valid regions after clamping'}), 400

        try:
            cmd = [
                'ffmpeg', '-y', '-i', in_path,
                '-vf', ','.join(filters),
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
                '-c:a', 'copy', '-movflags', '+faststart',
                out_path,
            ]
            ff = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if ff.returncode != 0:
                print(f'[erase] ffmpeg failed rc={ff.returncode} stderr={(ff.stderr or "")[-300:]}', flush=True)
                return jsonify({'error': 'ffmpeg failed', 'detail': (ff.stderr or '')[-300:]}), 500
        except FileNotFoundError:
            return jsonify({'error': 'ffmpeg not installed'}), 500
        except subprocess.TimeoutExpired:
            return jsonify({'error': 'Processing timed out (try a shorter clip)'}), 408

        if not os.path.exists(out_path) or os.path.getsize(out_path) < 1024:
            return jsonify({'error': 'Erasure produced empty output'}), 500

        with open(out_path, 'rb') as f:
            out_b64 = base64.b64encode(f.read()).decode('utf-8')

        return jsonify({
            'success': True,
            'videoData': out_b64,
            'ext': '.mp4',
            'size_mb': round(os.path.getsize(out_path) / (1024 * 1024), 2),
            'regions_applied': len(filters),
        })


# ── Instaloader endpoints ─────────────────────────────────────────────
def _parse_limit(default=12, cap=24):
    try:
        n = int(request.args.get('limit', default))
    except Exception:
        n = default
    return max(1, min(cap, n))

@app.route('/instagram/posts', methods=['GET'])
def instagram_posts():
    if not INSTALOADER_AVAILABLE:
        return _blocked_response()

    username = (request.args.get('username') or '').strip().lstrip('@')
    if not username or not all(c.isalnum() or c in '._' for c in username) or len(username) > 100:
        return jsonify({'error': 'Invalid username'}), 400
    limit = _parse_limit()

    cache_key = ('posts', username.lower(), limit)
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)

    loader = get_loader()
    posts_out = []

    def _scrape():
        profile = instaloader.Profile.from_username(loader.context, username)
        collected = []
        for i, post in enumerate(profile.get_posts()):
            if i >= limit or _deadline_exceeded():
                break
            mapped = _post_to_browse_dict(post)
            if mapped:
                collected.append(mapped)
            # Polite delay between iterations
            time.sleep(0.4)
        return collected

    try:
        ok, value = _run_with_timeout(_scrape, timeout_sec=min(45, REQUEST_DEADLINE_SEC - 5))
        if not ok:
            if isinstance(value, TimeoutError):
                return _blocked_response()
            if _is_blocked_exception(value):
                return _blocked_response()
            if isinstance(value, (QueryReturnedNotFoundException, ProfileNotExistsException)):
                return jsonify({'posts': []})
            return _blocked_response()
        posts_out = value or []
    except Exception as e:  # noqa: BLE001
        if _is_blocked_exception(e):
            return _blocked_response()
        return _blocked_response()

    payload = {'posts': posts_out}
    cache_set(cache_key, payload)
    return jsonify(payload)


@app.route('/instagram/post', methods=['GET'])
def instagram_post():
    if not INSTALOADER_AVAILABLE:
        return _blocked_response()

    url = (request.args.get('url') or '').strip()
    if not url:
        return jsonify({'error': 'Missing url'}), 400

    # Parse shortcode from a /p/<code>/ or /reel/<code>/ or /tv/<code>/ URL.
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or '').lower()
        if not (host.endswith('instagram.com') or host.endswith('instagr.am')):
            return jsonify({'error': 'Not an Instagram URL'}), 400
        parts = [p for p in (parsed.path or '').split('/') if p]
        shortcode = None
        for marker in ('p', 'reel', 'reels', 'tv'):
            if marker in parts:
                idx = parts.index(marker)
                if idx + 1 < len(parts):
                    shortcode = parts[idx + 1]
                    break
        if not shortcode or not all(c.isalnum() or c in '-_' for c in shortcode):
            return jsonify({'error': 'Could not parse shortcode'}), 400
    except Exception:
        return jsonify({'error': 'Invalid url'}), 400

    cache_key = ('post', shortcode, 0)
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)

    loader = get_loader()

    def _scrape():
        return instaloader.Post.from_shortcode(loader.context, shortcode)

    try:
        ok, value = _run_with_timeout(_scrape, timeout_sec=15)
        if not ok:
            if isinstance(value, TimeoutError):
                return _blocked_response()
            if isinstance(value, (QueryReturnedNotFoundException,)):
                return jsonify({'error': 'not_found'}), 404
            if _is_blocked_exception(value):
                return _blocked_response()
            return _blocked_response()
        post = value
        if post is None:
            return _blocked_response()
        mapped = _post_to_single_dict(post)
        if not mapped:
            return _blocked_response()
        cache_set(cache_key, mapped)
        return jsonify(mapped)
    except Exception as e:  # noqa: BLE001
        if _is_blocked_exception(e):
            return _blocked_response()
        return _blocked_response()


@app.route('/instagram/hashtag', methods=['GET'])
def instagram_hashtag():
    if not INSTALOADER_AVAILABLE:
        return _blocked_response()

    tag = (request.args.get('tag') or '').strip().lstrip('#').lower()
    tag = ''.join(c for c in tag if c.isalnum() or c == '_')[:100]
    if not tag:
        return jsonify({'error': 'Invalid tag'}), 400
    limit = _parse_limit()

    cache_key = ('hashtag', tag, limit)
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)

    loader = get_loader()

    def _scrape():
        hashtag = instaloader.Hashtag.from_name(loader.context, tag)
        collected = []
        # Prefer top posts (matches "Apify hashtag URL → posts" semantics).
        try:
            iterator = hashtag.get_top_posts()
        except Exception:
            iterator = hashtag.get_posts()
        for i, post in enumerate(iterator):
            if i >= limit or _deadline_exceeded():
                break
            mapped = _post_to_browse_dict(post)
            if mapped:
                collected.append(mapped)
            time.sleep(0.4)
        return collected

    try:
        ok, value = _run_with_timeout(_scrape, timeout_sec=min(45, REQUEST_DEADLINE_SEC - 5))
        if not ok:
            if isinstance(value, TimeoutError):
                return _blocked_response()
            if _is_blocked_exception(value):
                return _blocked_response()
            if isinstance(value, (QueryReturnedNotFoundException,)):
                return jsonify({'posts': []})
            return _blocked_response()
        payload = {'posts': value or []}
        cache_set(cache_key, payload)
        return jsonify(payload)
    except Exception as e:  # noqa: BLE001
        if _is_blocked_exception(e):
            return _blocked_response()
        return _blocked_response()


@app.route('/instagram/search', methods=['GET'])
def instagram_search():
    if not INSTALOADER_AVAILABLE:
        return _blocked_response()

    q = (request.args.get('q') or '').strip()
    if not q or len(q) > 200:
        return jsonify({'error': 'Invalid q'}), 400
    limit = _parse_limit()

    cache_key = ('search', q.lower(), limit)
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)

    loader = get_loader()

    def _scrape():
        # Instaloader anonymous user-search is limited. Strategy: take the
        # query as a potential handle (strip spaces, @), try as a profile;
        # if that fails, attempt TopSearchResults (works without login on
        # some builds).
        candidate = q.replace(' ', '').lstrip('@').lower()
        candidate = ''.join(c for c in candidate if c.isalnum() or c in '._')
        target_username = None
        if candidate and 2 <= len(candidate) <= 30:
            try:
                profile = instaloader.Profile.from_username(loader.context, candidate)
                target_username = profile.username
            except Exception:
                target_username = None

        if not target_username:
            try:
                from instaloader import TopSearchResults  # type: ignore
                results = TopSearchResults(loader.context, q)
                for p in results.get_profiles():
                    target_username = p.username
                    break
            except Exception:
                target_username = None

        if not target_username:
            return []

        profile = instaloader.Profile.from_username(loader.context, target_username)
        collected = []
        for i, post in enumerate(profile.get_posts()):
            if i >= limit or _deadline_exceeded():
                break
            mapped = _post_to_browse_dict(post)
            if mapped:
                collected.append(mapped)
            time.sleep(0.4)
        return collected

    try:
        ok, value = _run_with_timeout(_scrape, timeout_sec=min(45, REQUEST_DEADLINE_SEC - 5))
        if not ok:
            if isinstance(value, TimeoutError):
                return _blocked_response()
            if _is_blocked_exception(value):
                return _blocked_response()
            return _blocked_response()
        payload = {'posts': value or []}
        cache_set(cache_key, payload)
        return jsonify(payload)
    except Exception as e:  # noqa: BLE001
        if _is_blocked_exception(e):
            return _blocked_response()
        return _blocked_response()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
