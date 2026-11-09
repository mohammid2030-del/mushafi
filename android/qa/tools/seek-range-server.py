from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
import re,time
p=Path('/workspace/scratch/seek39-baqarah.mp3');log=Path('/workspace/scratch/seek39-ranges.log')
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_HEAD(self):self.serve(False)
 def do_GET(self):self.serve(True)
 def serve(self,body):
  if self.path!='/long.mp3':self.send_error(404);return
  size=p.stat().st_size;start=0;end=size-1;header=self.headers.get('Range');m=re.fullmatch(r'bytes=(\d+)-(\d*)',header or '')
  if m:start=int(m[1]);end=min(int(m[2]) if m[2] else end,end)
  if start>end:self.send_error(416);return
  self.send_response(206 if m else 200);self.send_header('Content-Type','audio/mpeg');self.send_header('Accept-Ranges','bytes');self.send_header('Content-Length',str(end-start+1))
  if m:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
  self.end_headers()
  if not body:return
  with log.open('a') as out:out.write(f'{start}-{end}\n')
  if start>0:time.sleep(.3)
  try:
   with p.open('rb') as f:
    f.seek(start);remaining=end-start+1
    while remaining:
     chunk=f.read(min(65536,remaining))
     if not chunk:break
     self.wfile.write(chunk);self.wfile.flush();remaining-=len(chunk);time.sleep(.005)
  except (BrokenPipeError,ConnectionResetError):pass
ThreadingHTTPServer(('127.0.0.1',8768),Handler).serve_forever()
