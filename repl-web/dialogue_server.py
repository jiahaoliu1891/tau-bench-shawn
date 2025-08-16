#!/usr/bin/env python3
"""
Dialogue Viewer Server
A simple HTTP server that serves the dialogue viewer and provides API endpoints for loading JSON files.
"""

import http.server
import socketserver
import json
import os
from urllib.parse import urlparse, parse_qs
import glob

PORT = 8080
RESULTS_DIR = "/Users/liujiahao/src/tau-bench/results"

class DialogueHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)
        
        # API endpoint to list available dialogue files
        if parsed_path.path == '/api/list-dialogues':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Find all JSON files in results directory
            json_files = glob.glob(os.path.join(RESULTS_DIR, "*.json"))
            dialogues = []
            for file_path in json_files:
                filename = os.path.basename(file_path)
                # Extract a readable name from filename
                parts = filename.replace('.json', '').split('_')
                if len(parts) >= 2:
                    model = parts[0]
                    timestamp = parts[-1] if parts[-1].isdigit() else ''
                    name = f"{model} ({timestamp})" if timestamp else model
                else:
                    name = filename.replace('.json', '')
                
                dialogues.append({
                    'path': file_path,
                    'name': name,
                    'filename': filename
                })
            
            self.wfile.write(json.dumps(dialogues).encode())
            
        # API endpoint to load a specific dialogue file
        elif parsed_path.path == '/api/load-dialogue':
            query_params = parse_qs(parsed_path.query)
            file_path = query_params.get('path', [''])[0]
            
            if file_path and os.path.exists(file_path):
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                with open(file_path, 'r') as f:
                    content = f.read()
                self.wfile.write(content.encode())
            else:
                self.send_error(404, "File not found")
                
        # Serve the HTML file
        elif parsed_path.path == '/' or parsed_path.path == '/dialogue_viewer.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            
            html_path = os.path.join(os.path.dirname(__file__), 'dialogue_viewer.html')
            if os.path.exists(html_path):
                with open(html_path, 'r') as f:
                    self.wfile.write(f.read().encode())
            else:
                self.wfile.write(b"<h1>dialogue_viewer.html not found</h1>")
        else:
            super().do_GET()

if __name__ == "__main__":
    print(f"Starting server on http://localhost:{PORT}")
    print(f"Open http://localhost:{PORT}/dialogue_viewer.html in your browser")
    
    with socketserver.TCPServer(("", PORT), DialogueHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")