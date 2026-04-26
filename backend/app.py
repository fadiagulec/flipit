from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess, os, tempfile, base64, json, glob

app = Flask(__name__)
CORS(app)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/download', methods=['POST', 'OPTIONS'])
def download():
    if request.method == 'OPTIONS':
        return '', 200

    data = request.get_json(silent=True) or {}
    url = (data.get('url') or '').strip()
    if not url:
        return jsonify({'error': 'Missing url'}), 400

    with tempfile.TemporaryDirectory() as tmpdir:
        out_tmpl = os.path.join(tmpdir, 'video.%(ext)s')

        def run_ytdlp(extra_args=[]):
            cmd = [
                'yt-dlp',
                '--no-playlist',
                '--max-filesize', '50m',
                '--socket-timeout', '30',
                '--impersonate', 'chrome',
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
        size_mb = os.path.getsize(filepath) / (1024 * 1024)

        with open(filepath, 'rb') as f:
            video_b64 = base64.b64encode(f.read()).decode('utf-8')

        return jsonify({
            'success': True,
            'videoData': video_b64,
            'ext': ext,
            'size_mb': round(size_mb, 2)
        })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
