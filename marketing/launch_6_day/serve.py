"""CORS-enabled tiny HTTP server to expose manifest.json to canva.com."""
import http.server
import socketserver
import sys

PORT = 8765


class CORSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), CORSHandler) as httpd:
    print(f'serving manifest on http://127.0.0.1:{PORT}/', file=sys.stderr, flush=True)
    httpd.serve_forever()
