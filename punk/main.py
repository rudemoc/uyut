import os
import json
import re
import uuid
import mimetypes
import base64
import random
from string import ascii_letters
from io import BytesIO
from PIL import Image

from flask import Flask, request, render_template, redirect, url_for, session, jsonify, send_file, Response
from flask_socketio import SocketIO, join_room, leave_room, send

# ----- App setup -----
app = Flask(__name__)
app.config["SECRET_KEY"] = "postpunksecretkey123"  # Change for production
socketio = SocketIO(app)

# ----- Storage -----
UPLOAD_ROOT = os.path.join(os.getcwd(), "uploads")
os.makedirs(UPLOAD_ROOT, exist_ok=True)

rooms = {}            # In-memory state
default_avatar = None # base64 default image

STORAGE_FILE = "rooms.json"

# ----- Default avatar -----
def create_default_avatar():
    img = Image.new('RGB', (32, 32), color='black')
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    draw.line((8, 8, 24, 24), fill='white', width=2)
    draw.line((8, 24, 24, 8), fill='white', width=2)
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

default_avatar = create_default_avatar()

# ----- Persistence helpers -----
def save_rooms():
    try:
        with open(STORAGE_FILE, "w", encoding="utf-8") as f:
            json.dump(rooms, f)
    except Exception as e:
        print(f"[Persistence] Save failed: {e}")

def load_rooms():
    global rooms
    if os.path.exists(STORAGE_FILE):
        try:
            with open(STORAGE_FILE, "r", encoding="utf-8") as f:
                rooms = json.load(f)
                # Reset volatile members count on restart
                for code in rooms:
                    rooms[code]["members"] = 0
        except Exception as e:
            print(f"[Persistence] Load failed: {e}")

load_rooms()

# ----- Helpers -----
def generate_room_code(length: int, existing_codes: list[str]) -> str:
    while True:
        code_chars = [random.choice(ascii_letters) for _ in range(length)]
        code = ''.join(code_chars)
        if code not in existing_codes:
            return code

def generate_tripcode():
    return ''.join(random.choice(ascii_letters + '0123456789') for _ in range(8))

def process_image(file):
    if not file or file.filename == '':
        return default_avatar
    if file.mimetype not in ['image/png', 'image/jpeg']:
        return default_avatar
    img = Image.open(file)
    img = img.resize((32, 32), Image.Resampling.LANCZOS)
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

def room_upload_dir(room_code: str) -> str:
    d = os.path.join(UPLOAD_ROOT, room_code)
    os.makedirs(d, exist_ok=True)
    return d

def safe_filename(name: str) -> str:
    base, ext = os.path.splitext(name)
    base = re.sub(r'[^A-Za-z0-9_\-\.]+', '_', base).strip('._') or 'file'
    ext = re.sub(r'[^A-Za-z0-9\.]+', '', ext)
    return base + ext

# ----- Routes -----
@app.route('/', methods=["GET", "POST"])
def home():
    session.clear()
    if request.method == "POST":
        name = request.form.get('name', '').strip()
        if not name:
            name = f"Anonymous##{generate_tripcode()}"
        avatar = process_image(request.files.get('avatar'))
        create = request.form.get('create')
        join = request.form.get('join')
        code = request.form.get('code', '').strip()
        is_public = bool(request.form.get('is_public'))
        title = request.form.get('title', '').strip() or None

        if create or not (join or create):
            room_code = generate_room_code(6, list(rooms.keys()))
            rooms[room_code] = {
                'members': 0,
                'messages': [],
                'public': is_public,
                'title': title or f'Room {room_code}',
            }
            session['room'] = room_code
            session['name'] = name
            session['avatar'] = avatar
            save_rooms()
            return redirect(url_for('room'))
        elif join and code:
            if code not in rooms:
                return render_template('home.html', error="Invalid room code", name=name, code=code)
            session['room'] = code
            session['name'] = name
            session['avatar'] = avatar
            return redirect(url_for('room'))
        else:
            error = "Please select 'Join' with a valid code or 'Create' to start a new room"
            return render_template('home.html', error=error, name=name, code=code)
    return render_template('home.html')

@app.route('/room')
def room():
    room_code = session.get('room')
    name = session.get('name')
    avatar = session.get('avatar')
    if not room_code or not name or room_code not in rooms:
        return redirect(url_for('home'))
    messages = rooms[room_code]['messages']
    return render_template(
        'room.html',
        room=room_code,
        title=rooms[room_code].get('title'),
        messages=messages,
        avatar=avatar,
        default_avatar=default_avatar,
    )

@app.get('/api/public-rooms')
def api_public_rooms():
    data = []
    for code, info in rooms.items():
        if info.get('public'):
            data.append({
                'code': code,
                'title': info.get('title') or f'Room {code}',
                'members': info.get('members', 0),
            })
    return {'rooms': data}

# ----- Media upload (HTTP, no transcoding) -----
@app.post('/upload')
def upload():
    room_code = session.get('room')
    name = session.get('name')
    if not room_code or not name or room_code not in rooms:
        return jsonify({'error': 'Not in a room'}), 400

    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    filename = safe_filename(file.filename)
    mimetype = file.mimetype or mimetypes.guess_type(filename)[0] or 'application/octet-stream'
    rdir = room_upload_dir(room_code)
    unique = f"{uuid.uuid4().hex[:8]}_{filename}"
    path = os.path.join(rdir, unique)
    file.save(path)

    url = url_for('media', room=room_code, filename=unique)

    if mimetype.startswith('video/'):
        meta = {'kind': 'video', 'name': unique, 'type': mimetype, 'url': url}
        return jsonify(meta)
    elif mimetype.startswith('image/'):
        return jsonify({'kind': 'image', 'name': unique, 'type': mimetype, 'url': url})
    else:
        return jsonify({'kind': 'file', 'name': unique, 'type': mimetype, 'url': url})

# ----- Media streaming (Range for videos) -----
@app.route("/media/<room>/<path:filename>")
def media(room, filename):
    room_path = os.path.join(UPLOAD_ROOT, room)
    file_path = os.path.join(room_path, filename)
    if not os.path.isfile(file_path):
        return "Not found", 404

    ctype = mimetypes.guess_type(file_path)[0] or 'application/octet-stream'

    # Videos: implement Range support for smooth seeking
    if ctype.startswith('video/'):
        range_header = request.headers.get('Range')
        size = os.path.getsize(file_path)
        if not range_header:
            return send_file(file_path, mimetype=ctype)

        byte1, byte2 = 0, None
        match = re.match(r'bytes=(\d+)-(\d*)', range_header)
        if match:
            g1, g2 = match.groups()
            if g1: byte1 = int(g1)
            if g2: byte2 = int(g2) if g2.isdigit() else None

        length = size - byte1 if byte2 is None else byte2 - byte1 + 1
        with open(file_path, 'rb') as f:
            f.seek(byte1)
            data = f.read(length)

        rv = Response(data, 206, mimetype=ctype, direct_passthrough=True)
        rv.headers.add('Content-Range', f'bytes {byte1}-{byte1 + length - 1}/{size}')
        rv.headers.add('Accept-Ranges', 'bytes')
        rv.headers.add('Content-Length', str(length))
        return rv

    # Default: send file as-is (images, docs)
    return send_file(file_path, mimetype=ctype)

# ----- Socket handlers -----
@socketio.on('connect')
def on_connect():
    room_code = session.get('room')
    name = session.get('name')
    if not room_code or not name:
        return
    join_room(room_code)
    rooms[room_code]['members'] = rooms[room_code].get('members', 0) + 1
    msg = {"sender": "System", "message": f"{name} has entered the room.", "avatar": None}
    send(msg, room=room_code)

@socketio.on('message')
def on_message(data):
    room_code = session.get('room')
    name = session.get('name')
    avatar = session.get('avatar')
    if room_code not in rooms or not data:
        return

    content = {
        "sender": name,
        "message": (data.get('message') or '').strip(),
        "avatar": avatar
    }

    file_meta = data.get('file')
    if file_meta:
        content['file'] = {
            'kind': file_meta.get('kind'),
            'name': file_meta.get('name'),
            'type': file_meta.get('type'),
            'url': file_meta.get('url')
        }

    if not content['message'] and not content.get('file'):
        return

    send(content, room=room_code)
    rooms[room_code]['messages'].append(content)
    save_rooms()

@socketio.on('disconnect')
def on_disconnect():
    room_code = session.get('room')
    name = session.get('name')
    if not room_code or not name:
        return
    leave_room(room_code)
    if room_code in rooms:
        rooms[room_code]['members'] = max(0, rooms[room_code].get('members', 0) - 1)
        msg = {"sender": "System", "message": f"{name} has left the room.", "avatar": None}
        send(msg, room=room_code)
        if rooms[room_code]['members'] <= 0:
            if not rooms[room_code].get('public'):
                del rooms[room_code]
                save_rooms()

# ----- Run -----
if __name__ == "__main__":
    socketio.run(app, debug=True)