import os
import json
import re
import uuid
import mimetypes
import base64
import random
import time
import hashlib
import hmac
import math
from datetime import datetime
from string import ascii_letters
from io import BytesIO
from PIL import Image, ImageOps
from flask import Flask, request, render_template, redirect, url_for, session, jsonify, send_file, Response
from flask_socketio import SocketIO, join_room, leave_room, send

# ----- App setup -----
app = Flask(__name__)
app.config["SECRET_KEY"] = "postpunksecretkey123"
app.config['SESSION_COOKIE_MAX_SIZE'] = 4096 * 4
socketio = SocketIO(app)

# ----- Storage -----
UPLOAD_ROOT = os.path.join(os.getcwd(), "uploads")
AVATARS_ROOT = os.path.join(os.getcwd(), "avatars")
THUMBNAILS_ROOT = os.path.join(os.getcwd(), "thumbnails")
os.makedirs(UPLOAD_ROOT, exist_ok=True)
os.makedirs(AVATARS_ROOT, exist_ok=True)
os.makedirs(THUMBNAILS_ROOT, exist_ok=True)

rooms = {}
users = {}
sessions = {}
verification_codes = {}

default_avatar = None

STORAGE_FILE = "rooms.json"
USERS_FILE = "users.json"

# ----- File size limit -----
MAX_UPLOAD_SIZE = 400 * 1024 * 1024

# ----- Конфигурация аутентификации -----
VERIFICATION_CODE_EXPIRY = 300
SESSION_EXPIRY = 30 * 24 * 60 * 60

# ----- Password hashing -----
def hash_password(password):
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt,
        100000
    )
    return salt + key

def verify_password(stored_password, provided_password):
    salt = stored_password[:32]
    stored_key = stored_password[32:]
    key = hashlib.pbkdf2_hmac(
        'sha256',
        provided_password.encode('utf-8'),
        salt,
        100000
    )
    return hmac.compare_digest(stored_key, key)

# ----- Default avatar -----
def create_default_avatar():
    img = Image.new('RGB', (256, 256), color='#15202b')
    from PIL import ImageDraw, ImageFont
    draw = ImageDraw.Draw(img)
    
    try:
        font = ImageFont.truetype("arial.ttf", 100)
    except:
        font = ImageFont.load_default()
    
    draw.ellipse([(0, 0), (255, 255)], fill='#19cf86')
    draw.text((128, 128), "U", fill='#15202b', font=font, anchor="mm")
    
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
                for code in rooms:
                    rooms[code]["members"] = 0
        except Exception as e:
            print(f"[Persistence] Load failed: {e}")

def save_users():
    try:
        with open(USERS_FILE, "w", encoding="utf-8") as f:
            users_to_save = {}
            for user_id, user_data in users.items():
                user_data_copy = user_data.copy()
                if 'password_hash' in user_data_copy and isinstance(user_data_copy['password_hash'], bytes):
                    user_data_copy['password_hash'] = base64.b64encode(user_data_copy['password_hash']).decode('utf-8')
                if 'avatar' in user_data_copy and user_data_copy['avatar'] and len(user_data_copy['avatar']) > 10000:
                    user_data_copy['avatar'] = 'file'
                users_to_save[user_id] = user_data_copy
            json.dump(users_to_save, f)
        print(f"Users saved successfully. Total users: {len(users)}")
    except Exception as e:
        print(f"[Users] Save failed: {e}")

def load_users():
    global users
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                users_loaded = json.load(f)
                for user_id, user_data in users_loaded.items():
                    if 'password_hash' in user_data and isinstance(user_data['password_hash'], str):
                        user_data['password_hash'] = base64.b64decode(user_data['password_hash'])
                    if user_data.get('avatar') == 'file':
                        avatar_path = os.path.join(AVATARS_ROOT, f"{user_id}.png")
                        if os.path.exists(avatar_path):
                            with open(avatar_path, 'rb') as avatar_file:
                                user_data['avatar'] = base64.b64encode(avatar_file.read()).decode('utf-8')
                        else:
                            user_data['avatar'] = default_avatar
                users = users_loaded
            print(f"Users loaded successfully. Total users: {len(users)}")
        except Exception as e:
            print(f"[Users] Load failed: {e}")
            users = {}
    else:
        users = {}

load_rooms()
load_users()

# ----- Email validation -----
def validate_email(email):
    if not email or '@' not in email:
        return None
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if re.match(pattern, email.strip().lower()):
        return email.strip().lower()
    return None

# ----- Password validation -----
def validate_password(password):
    if len(password) < 6:
        return "Пароль должен содержать минимум 6 символов"
    if len(password) > 100:
        return "Пароль слишком длинный"
    return None

# ----- Verification code system -----
def generate_verification_code():
    return str(random.randint(100000, 999999))

def send_verification_email(email, code):
    print(f"[EMAIL] Код подтверждения для {email}: {code}")
    return True

# ----- User management -----
def create_user(email, username, password, avatar=None):
    user_id = str(uuid.uuid4())
    user = {
        'id': user_id,
        'email': email,
        'username': username,
        'display_name': username,
        'avatar': avatar or default_avatar,
        'bio': '',
        'created_at': time.time(),
        'last_seen': time.time(),
        'is_verified': False,
        'password_hash': hash_password(password)
    }
    users[user_id] = user
    save_users()
    return user

def find_user_by_email(email):
    for user in users.values():
        if user.get('email') == email:
            return user
    return None

def find_user_by_username(username):
    for user in users.values():
        if user.get('username') == username:
            return user
    return None

def update_user_last_seen(user_id):
    if user_id in users:
        users[user_id]['last_seen'] = time.time()
        save_users()

# ----- Authentication middleware -----
def require_auth(f):
    def decorated(*args, **kwargs):
        if 'user_id' not in session or session['user_id'] not in users:
            return redirect(url_for('auth_required'))
        return f(*args, **kwargs)
    decorated.__name__ = f.__name__
    return decorated

# ----- Helpers -----
def generate_room_code(length: int, existing_codes: list[str]) -> str:
    while True:
        code_chars = [random.choice(ascii_letters) for _ in range(length)]
        code = ''.join(code_chars)
        if code not in existing_codes:
            return code

def process_avatar(file, crop_data=None):
    if not file or file.filename == '':
        print("No file provided for avatar processing")
        return None
    
    print(f"Processing avatar: {file.filename}, type: {file.mimetype}, size: {file.content_length}")
    
    if file.mimetype not in ['image/png', 'image/jpeg', 'image/gif']:
        print(f"Unsupported file type: {file.mimetype}")
        return None
    
    try:
        img = Image.open(file)
        print(f"Image opened: {img.size}, mode: {img.mode}")
        
        if img.mode != 'RGB':
            print(f"Converting image from {img.mode} to RGB")
            img = img.convert('RGB')
        
        if crop_data:
            try:
                crop_data_dict = json.loads(crop_data)
                print(f"Crop data: {crop_data_dict}")
                x = crop_data_dict['x']
                y = crop_data_dict['y'] 
                width = crop_data_dict['width']
                height = crop_data_dict['height']
                img = img.crop((x, y, x + width, y + height))
                print(f"Image cropped to: {img.size}")
            except Exception as e:
                print(f"Crop data error: {e}")
        
        print(f"Resizing image to 256x256")
        img = ImageOps.fit(img, (256, 256), method=Image.Resampling.LANCZOS)
        
        buffer = BytesIO()
        img.save(buffer, format="PNG", quality=95)
        avatar_data = base64.b64encode(buffer.getvalue()).decode('utf-8')
        print(f"Avatar processing successful, data length: {len(avatar_data)}")
        return avatar_data
    except Exception as e:
        print(f"Avatar processing error: {e}")
        return None

def create_thumbnail(file_path, filename):
    """Создает миниатюру для изображений и видео"""
    try:
        thumb_path = os.path.join(THUMBNAILS_ROOT, f"thumb_{filename}")
        
        # Для изображений
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp')):
            img = Image.open(file_path)
            img.thumbnail((400, 400), Image.Resampling.LANCZOS)
            img.save(thumb_path, "JPEG", quality=60)
            return thumb_path
        
        # Для видео (требуется ffmpeg, но мы просто вернем оригинал если нет)
        elif filename.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
            # Здесь можно добавить создание превью для видео
            # Пока просто возвращаем оригинальный путь
            return file_path
            
    except Exception as e:
        print(f"Thumbnail creation error: {e}")
        return file_path
    
    return file_path

def save_avatar_to_file(user_id, avatar_data):
    try:
        avatar_path = os.path.join(AVATARS_ROOT, f"{user_id}.png")
        with open(avatar_path, 'wb') as f:
            f.write(base64.b64decode(avatar_data))
        print(f"Avatar saved to file: {avatar_path}")
        return True
    except Exception as e:
        print(f"Error saving avatar to file: {e}")
        return False

def room_upload_dir(room_code: str) -> str:
    d = os.path.join(UPLOAD_ROOT, room_code)
    os.makedirs(d, exist_ok=True)
    return d

def safe_filename(name: str) -> str:
    base, ext = os.path.splitext(name)
    base = re.sub(r'[^A-Za-z0-9_\-\.]+', '_', base).strip('._') or 'file'
    ext = re.sub(r'[^A-Za-z0-9\.]+', '', ext)
    return base + ext

# ----- Time formatting helpers -----
def time_ago(timestamp):
    now = time.time()
    diff = now - timestamp
    
    if diff < 60:
        return "только что"
    elif diff < 3600:
        minutes = math.floor(diff / 60)
        return f"{minutes} мин назад"
    elif diff < 86400:
        hours = math.floor(diff / 3600)
        return f"{hours} ч назад"
    elif diff < 2592000:
        days = math.floor(diff / 86400)
        return f"{days} д назад"
    else:
        return datetime.fromtimestamp(timestamp).strftime('%d.%m.%Y')

# ----- Context processors -----
@app.context_processor
def utility_processor():
    return {
        'time_ago': time_ago,
        'datetime': lambda x: datetime.fromtimestamp(x).strftime('%d.%m.%Y %H:%M'),
        'default_avatar': default_avatar
    }

# ----- Private messaging system -----
def create_private_room(user1_id, user2_id):
    room_id = f"private_{min(user1_id, user2_id)}_{max(user1_id, user2_id)}"
    
    if room_id not in rooms:
        user1 = users.get(user1_id)
        user2 = users.get(user2_id)
        
        rooms[room_id] = {
            'members': 0,
            'messages': [],
            'public': False,
            'private': True,
            'participants': [user1_id, user2_id],
            'title': f"Чат с {user2['display_name']}" if user1_id == user1_id else f"Чат с {user1['display_name']}",
            'created_by': user1_id,
            'created_at': time.time()
        }
        save_rooms()
    
    return room_id

# ----- Authentication Routes -----
@app.route('/auth', methods=['GET', 'POST'])
def auth_required():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        
        validated_email = validate_email(email)
        
        if not validated_email:
            return render_template('auth.html', error="Неверный формат email. Пример: user@example.com")
        
        if validated_email in verification_codes:
            last_sent = verification_codes[validated_email].get('timestamp', 0)
            if time.time() - last_sent < 60:
                return render_template('auth.html', error="Подождите 60 секунд перед отправкой нового кода")
        
        code = generate_verification_code()
        verification_codes[validated_email] = {
            'code': code,
            'timestamp': time.time(),
            'attempts': 0
        }
        
        if send_verification_email(validated_email, code):
            session['pending_email'] = validated_email
            return redirect(url_for('verify_code'))
        else:
            return render_template('auth.html', error="Ошибка отправки email")
    
    return render_template('auth.html')

@app.route('/auth/verify', methods=['GET', 'POST'])
def verify_code():
    pending_email = session.get('pending_email')
    if not pending_email:
        return redirect(url_for('auth_required'))
    
    if request.method == 'POST':
        code = request.form.get('code', '').strip()
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        password_confirm = request.form.get('password_confirm', '')
        
        if not code or not username or not password:
            return render_template('verify.html', error="Заполните все поля")
        
        if len(username) < 2 or len(username) > 20:
            return render_template('verify.html', error="Имя пользователя должно быть от 2 до 20 символов")
        
        if find_user_by_username(username):
            return render_template('verify.html', error="Это имя пользователя уже занято")
        
        password_error = validate_password(password)
        if password_error:
            return render_template('verify.html', error=password_error)
        
        if password != password_confirm:
            return render_template('verify.html', error="Пароли не совпадают")
        
        if pending_email not in verification_codes:
            return render_template('verify.html', error="Код устарел, запросите новый")
        
        verification_data = verification_codes[pending_email]
        
        if verification_data['attempts'] >= 5:
            del verification_codes[pending_email]
            return render_template('verify.html', error="Слишком много попыток, запросите новый код")
        
        if time.time() - verification_data['timestamp'] > VERIFICATION_CODE_EXPIRY:
            del verification_codes[pending_email]
            return render_template('verify.html', error="Код устарел, запросите новый")
        
        if code != verification_data['code']:
            verification_data['attempts'] += 1
            return render_template('verify.html', error="Неверный код подтверждения")
        
        user = find_user_by_email(pending_email)
        if not user:
            user = create_user(pending_email, username, password)
        else:
            return render_template('verify.html', error="Пользователь с этим email уже существует")
        
        session['user_id'] = user['id']
        session['username'] = user['username']
        
        del verification_codes[pending_email]
        session.pop('pending_email', None)
        
        return redirect(url_for('home'))
    
    return render_template('verify.html')

@app.route('/auth/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        
        validated_email = validate_email(email)
        if not validated_email:
            return render_template('login.html', error="Неверный формат email")
        
        user = find_user_by_email(validated_email)
        if not user:
            return render_template('login.html', error="Пользователь с таким email не найден")
        
        if not verify_password(user.get('password_hash', b''), password):
            return render_template('login.html', error="Неверный пароль")
        
        print(f"Login successful for user: {user['username']}")
        print(f"User avatar length: {len(user.get('avatar', ''))}")
        
        session['user_id'] = user['id']
        session['username'] = user['username']
        
        return redirect(url_for('home'))
    
    return render_template('login.html')

@app.route('/profile/change-password', methods=['GET', 'POST'])
@require_auth
def change_password():
    user_id = session['user_id']
    user = users.get(user_id)
    
    if not user:
        session.clear()
        return redirect(url_for('auth_required'))
    
    if request.method == 'POST':
        current_password = request.form.get('current_password', '')
        new_password = request.form.get('new_password', '')
        confirm_password = request.form.get('confirm_password', '')
        
        if not verify_password(user.get('password_hash', b''), current_password):
            return render_template('change_password.html', error="Неверный текущий пароль")
        
        password_error = validate_password(new_password)
        if password_error:
            return render_template('change_password.html', error=password_error)
        
        if new_password != confirm_password:
            return render_template('change_password.html', error="Новые пароли не совпадают")
        
        user['password_hash'] = hash_password(new_password)
        save_users()
        
        return render_template('change_password.html', success="Пароль успешно изменен")
    
    return render_template('change_password.html')

@app.route('/profile', methods=['GET', 'POST'])
@require_auth
def profile():
    user_id = session['user_id']
    user = users.get(user_id)
    
    if not user:
        session.clear()
        return redirect(url_for('auth_required'))
    
    if request.method == 'POST':
        display_name = request.form.get('display_name', '').strip()
        bio = request.form.get('bio', '').strip()
        avatar_file = request.files.get('avatar')
        crop_data = request.form.get('crop_data')
        
        print(f"Profile update for user {user_id}:")
        print(f"Display name: {display_name}")
        print(f"Bio: {bio}")
        print(f"Avatar file: {avatar_file}")
        print(f"Crop data: {crop_data}")
        
        if display_name:
            user['display_name'] = display_name
            session['username'] = display_name
        
        if bio:
            user['bio'] = bio
            
        if avatar_file and avatar_file.filename:
            print(f"Processing avatar file: {avatar_file.filename}")
            new_avatar = process_avatar(avatar_file, crop_data)
            if new_avatar:
                user['avatar'] = new_avatar
                save_avatar_to_file(user_id, new_avatar)
                print(f"Avatar updated successfully for user {user_id}")
            else:
                print(f"Avatar processing failed for user {user_id}")
        else:
            print("No avatar file provided")
        
        save_users()
        print("User data saved successfully")
        return redirect(url_for('profile'))
    
    return render_template('profile.html', user=user)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('auth_required'))

# ----- Main Routes -----
@app.route('/', methods=["GET", "POST"])
@require_auth
def home():
    user_id = session.get('user_id')
    if not user_id or user_id not in users:
        return redirect(url_for('auth_required'))
    
    user = users.get(user_id)
    if not user:
        session.clear()
        return redirect(url_for('auth_required'))
    
    if request.method == "POST":
        create = request.form.get('create')
        join = request.form.get('join')
        code = request.form.get('code', '').strip()
        is_public = bool(request.form.get('is_public'))
        title = request.form.get('title', '').strip() or None

        if create or not (join or create):
            room_code = generate_room_code(16, list(rooms.keys()))
            rooms[room_code] = {
                'members': 0,
                'messages': [],
                'public': is_public,
                'title': title or f'Room {room_code}',
                'created_by': session['user_id'],
                'created_at': time.time()
            }
            session['room'] = room_code
            save_rooms()
            return redirect(url_for('room'))
        elif join and code:
            if code not in rooms:
                return render_template('home.html', error="Неверный код комнаты", code=code, user=user)
            session['room'] = code
            return redirect(url_for('room'))
        else:
            error = "Пожалуйста, выберите 'Войти' с правильным кодом или 'Создать' для новой комнаты"
            return render_template('home.html', error=error, code=code, user=user)
    
    return render_template('home.html', user=user)

@app.route('/room')
@require_auth
def room():
    requested_room = request.args.get('room')
    if requested_room:
        session['room'] = requested_room
        return redirect(url_for('room'))
    
    room_code = session.get('room')
    user_id = session.get('user_id')
    
    if not room_code or room_code not in rooms or not user_id or user_id not in users:
        return redirect(url_for('home'))
    
    update_user_last_seen(user_id)
    messages = rooms[room_code]['messages']
    user = users[user_id]
    
    return render_template(
        'room.html',
        room=room_code,
        title=rooms[room_code].get('title'),
        messages=messages,
        user=user,
        default_avatar=default_avatar,
    )

# ----- Delete message endpoint -----
@app.route('/delete_message', methods=['POST'])
@require_auth
def delete_message():
    user_id = session['user_id']
    room_code = request.json.get('room_code')
    message_index = request.json.get('message_index')
    message_timestamp = request.json.get('timestamp')
    
    print(f"Delete message request: room={room_code}, index={message_index}, user={user_id}")
    
    if not room_code or message_index is None or not message_timestamp:
        return jsonify({'success': False, 'error': 'Missing parameters'})
    
    if room_code not in rooms:
        print(f"Room not found: {room_code}")
        return jsonify({'success': False, 'error': 'Room not found'})
    
    room_data = rooms[room_code]
    
    # Проверяем, что сообщение существует
    if message_index >= len(room_data['messages']):
        return jsonify({'success': False, 'error': 'Message not found'})
    
    message = room_data['messages'][message_index]
    
    # Проверяем права: можно удалять свои сообщения или если пользователь создатель комнаты
    can_delete = (message.get('user_id') == user_id or 
                  room_data.get('created_by') == user_id or
                  room_data.get('private') and user_id in room_data.get('participants', []))
    
    if not can_delete:
        return jsonify({'success': False, 'error': 'No permission to delete this message'})
    
    # Проверяем, что timestamp совпадает (дополнительная проверка)
    if message.get('timestamp') != message_timestamp:
        return jsonify({'success': False, 'error': 'Message timestamp mismatch'})
    
    # Удаляем сообщение
    deleted_message = room_data['messages'].pop(message_index)
    
    # Если в сообщении были файлы, удаляем их с диска
    if deleted_message.get('file'):
        try:
            file_path = os.path.join(UPLOAD_ROOT, room_code, deleted_message['file']['name'])
            if os.path.exists(file_path):
                os.remove(file_path)
            
            # Удаляем миниатюру если есть
            thumb_path = os.path.join(THUMBNAILS_ROOT, f"thumb_{deleted_message['file']['name']}")
            if os.path.exists(thumb_path):
                os.remove(thumb_path)
        except Exception as e:
            print(f"Error deleting file: {e}")
    
    save_rooms()
    
    # Отправляем событие удаления через socket.io
    socketio.emit('message_deleted', {
        'room_code': room_code,
        'message_index': message_index,
        'timestamp': message_timestamp
    }, room=room_code)
    
    return jsonify({'success': True})

# ----- User Profiles and Private Messages -----
@app.route('/user/<user_id>')
@require_auth
def user_profile(user_id):
    current_user_id = session['user_id']
    profile_user = users.get(user_id)
    
    if not profile_user:
        return render_template('error.html', error="Пользователь не найден"), 404
    
    existing_room_id = None
    room_id = f"private_{min(current_user_id, user_id)}_{max(current_user_id, user_id)}"
    if room_id in rooms:
        existing_room_id = room_id
    
    return render_template('user_profile.html', 
                         user=profile_user,
                         existing_room_id=existing_room_id)

@app.route('/start_chat/<user_id>')
@require_auth
def start_private_message(user_id):
    current_user_id = session['user_id']
    
    if user_id not in users:
        return render_template('error.html', error="Пользователь не найден"), 404
    
    room_id = create_private_room(current_user_id, user_id)
    session['room'] = room_id
    return redirect(url_for('room'))

@app.route('/api/user/<user_id>/avatar')
def get_user_avatar(user_id):
    user = users.get(user_id)
    if not user:
        return "User not found", 404
    
    avatar_data = user.get('avatar', default_avatar)
    try:
        return send_file(BytesIO(base64.b64decode(avatar_data)), mimetype='image/png')
    except:
        return send_file(BytesIO(base64.b64decode(default_avatar)), mimetype='image/png')

# ----- Notifications and Recent Chats -----
@app.route('/api/notifications')
@require_auth
def get_notifications():
    user_id = session['user_id']
    notifications = []
    
    for room_code, room_info in rooms.items():
        if room_info.get('private') and user_id in room_info.get('participants', []):
            if room_info['messages']:
                last_message = room_info['messages'][-1]
                if (last_message.get('user_id') != user_id and 
                    last_message.get('timestamp', 0) > users[user_id].get('last_notification_check', 0)):
                    
                    other_user_id = [uid for uid in room_info['participants'] if uid != user_id][0]
                    other_user = users.get(other_user_id)
                    
                    if other_user:
                        notifications.append({
                            'type': 'message',
                            'from_user': other_user['display_name'],
                            'from_user_id': other_user_id,
                            'room_id': room_code,
                            'preview': last_message.get('message', '')[:100],
                            'timestamp': last_message.get('timestamp', time.time())
                        })
    
    return jsonify({'notifications': notifications})

@app.route('/api/recent-chats')
@require_auth
def get_recent_chats():
    user_id = session['user_id']
    recent_chats = []
    
    for room_code, room_info in rooms.items():
        if room_info.get('private') and user_id in room_info.get('participants', []):
            other_user_id = [uid for uid in room_info['participants'] if uid != user_id][0]
            other_user = users.get(other_user_id)
            
            if other_user:
                last_message = room_info['messages'][-1] if room_info['messages'] else None
                
                chat_data = {
                    'user_id': other_user_id,
                    'display_name': other_user['display_name'],
                    'username': other_user['username'],
                    'avatar': other_user['avatar'],
                    'room_id': room_code,
                    'unread': False
                }
                
                if last_message:
                    chat_data.update({
                        'last_message': last_message.get('message', '')[:100],
                        'timestamp': last_message.get('timestamp', time.time())
                    })
                else:
                    chat_data.update({
                        'last_message': 'Чат начат',
                        'timestamp': room_info.get('created_at', time.time())
                    })
                
                recent_chats.append(chat_data)
    
    recent_chats.sort(key=lambda x: x['timestamp'], reverse=True)
    return jsonify({'chats': recent_chats})

@app.route('/notifications')
@require_auth
def notifications_page():
    user_id = session['user_id']
    user = users.get(user_id)
    return render_template('notifications.html', user=user)

# ----- Public Rooms API -----
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

# ----- Search Rooms API -----
@app.get('/api/search-rooms')
def api_search_rooms():
    query = request.args.get('q', '').strip().lower()
    if not query or len(query) < 1:
        return {'rooms': []}
    
    results = []
    for code, info in rooms.items():
        if info.get('public'):
            title = info.get('title', '').lower()
            code_lower = code.lower()
            
            # Ищем по названию и коду
            if (query in title or 
                query in code_lower or 
                any(word in title for word in query.split())):
                
                results.append({
                    'code': code,
                    'title': info.get('title') or f'Room {code}',
                    'members': info.get('members', 0),
                })
    
    # Сортируем: сначала точные совпадения в названии, потом по коду
    results.sort(key=lambda x: (
        query not in x['title'].lower(),
        query not in x['code'].lower(),
        -x.get('members', 0)
    ))
    
    return {'rooms': results[:10]}  # Ограничиваем результаты

# ----- Media upload -----
@app.post('/upload')
@require_auth
def upload():
    room_code = session.get('room')
    if not room_code or room_code not in rooms:
        return jsonify({'error': 'Not in a room'}), 400

    if request.content_length > MAX_UPLOAD_SIZE:
        return jsonify({'error': 'Request too large'}), 400

    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    file.seek(0, os.SEEK_END)
    file_length = file.tell()
    file.seek(0)
    if file_length > MAX_UPLOAD_SIZE:
        return jsonify({'error': 'File too large'}), 400

    filename = safe_filename(file.filename)
    mimetype = file.mimetype or mimetypes.guess_type(filename)[0] or 'application/octet-stream'
    rdir = room_upload_dir(room_code)
    unique = f"{uuid.uuid4().hex[:8]}_{filename}"
    path = os.path.join(rdir, unique)
    file.save(path)

    # Создаем миниатюру для изображений
    thumbnail_path = create_thumbnail(path, unique)

    url = url_for('media', room=room_code, filename=unique)
    thumb_url = url_for('media', room=room_code, filename=unique)  # Пока используем тот же URL

    if mimetype.startswith('video/'): 
        meta = {'kind': 'video', 'name': unique, 'type': mimetype, 'url': url, 'thumb_url': thumb_url}
        return jsonify(meta)
    elif mimetype.startswith('image/'):
        meta = {'kind': 'image', 'name': unique, 'type': mimetype, 'url': url, 'thumb_url': thumb_url}
        return jsonify(meta)
    elif mimetype.startswith('audio/'):
        return jsonify({'kind': 'audio', 'name': unique, 'type': mimetype, 'url': url})
    else:
        return jsonify({'kind': 'file', 'name': unique, 'type': mimetype, 'url': url})

# ----- Enhanced Media streaming -----
@app.route("/media/<room>/<path:filename>")
def media(room, filename):
    room_path = os.path.join(UPLOAD_ROOT, room)
    file_path = os.path.join(room_path, filename)
    
    # Проверяем, запрашивается ли миниатюра
    thumb_request = request.args.get('thumb')
    if thumb_request and filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp')):
        thumb_path = os.path.join(THUMBNAILS_ROOT, f"thumb_{filename}")
        if os.path.exists(thumb_path):
            file_path = thumb_path
    
    if not os.path.isfile(file_path):
        return "Not found", 404

    ctype = mimetypes.guess_type(file_path)[0] or 'application/octet-stream'
    file_size = os.path.getsize(file_path)

    range_header = request.headers.get('Range')
    
    if range_header and ctype.startswith('video/'):
        byte1, byte2 = 0, None
        match = re.match(r'bytes=(\d+)-(\d*)', range_header)
        if match:
            g1, g2 = match.groups()
            byte1 = int(g1) if g1 else 0
            byte2 = int(g2) if g2 and g2.isdigit() else file_size - 1
        
        content_length = byte2 - byte1 + 1 if byte2 else file_size - byte1
        
        with open(file_path, 'rb') as f:
            f.seek(byte1)
            data = f.read(content_length)

        response = Response(data, 206, mimetype=ctype, direct_passthrough=True)
        response.headers.add('Content-Range', f'bytes {byte1}-{byte1 + content_length - 1}/{file_size}')
        response.headers.add('Accept-Ranges', 'bytes')
        response.headers.add('Content-Length', str(content_length))
        response.headers.add('Cache-Control', 'no-cache')
        return response
    else:
        response = send_file(file_path, mimetype=ctype)
        response.headers.add('Accept-Ranges', 'bytes')
        response.headers.add('Cache-Control', 'public, max-age=3600')
        return response

# ----- Error handler -----
@app.route('/error')
def error_page():
    error_msg = request.args.get('error', 'Произошла неизвестная ошибка')
    return render_template('error.html', error=error_msg)

# ----- Socket handlers -----
@socketio.on('connect')
def on_connect():
    user_id = session.get('user_id')
    if not user_id or user_id not in users:
        return False
    
    room_code = session.get('room')
    if not room_code:
        return
    
    user = users[user_id]
    join_room(room_code)
    rooms[room_code]['members'] = rooms[room_code].get('members', 0) + 1
    
    msg = {
        "sender": "System", 
        "message": f"{user.get('display_name', user.get('username', 'User'))} вошел в комнату.", 
        "avatar": None,
        "timestamp": time.time()
    }
    send(msg, room=room_code)

@socketio.on('message')
def on_message(data):
    user_id = session.get('user_id')
    if not user_id or user_id not in users:
        return
    
    room_code = session.get('room')
    user = users[user_id]
    
    if room_code not in rooms or not data:
        return

    message_text = (data.get('message') or '').strip()
    if len(message_text) > 512:
        return

    content = {
        "sender": user.get('display_name', user.get('username', 'User')),
        "message": message_text,
        "avatar": user.get('avatar'),
        "user_id": user_id,
        "timestamp": time.time()
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

@socketio.on('message_deleted')
def on_message_deleted(data):
    room_code = data.get('room_code')
    message_index = data.get('message_index')
    
    if room_code in rooms and 0 <= message_index < len(rooms[room_code]['messages']):
        # Обновляем сообщение в комнате
        rooms[room_code]['messages'][message_index] = {
            "sender": "System",
            "message": "Сообщение было удалено",
            "avatar": None,
            "timestamp": time.time(),
            "deleted": True
        }
        save_rooms()

@socketio.on('disconnect')
def on_disconnect():
    user_id = session.get('user_id')
    if not user_id:
        return
        
    room_code = session.get('room')
    user = users.get(user_id)
    
    if not room_code or not user:
        return
        
    leave_room(room_code)
    if room_code in rooms:
        rooms[room_code]['members'] = max(0, rooms[room_code].get('members', 0) - 1)
        msg = {
            "sender": "System", 
            "message": f"{user.get('display_name', user.get('username', 'User'))} покинул комнату.", 
            "avatar": None,
            "timestamp": time.time()
        }
        send(msg, room=room_code)
        if rooms[room_code]['members'] <= 0 and not rooms[room_code].get('private'):
            if not rooms[room_code].get('public'):
                del rooms[room_code]
                save_rooms()

@app.template_filter('datetime')
def format_datetime(timestamp):
    if not timestamp:
        return "Неизвестно"
    try:
        return datetime.fromtimestamp(timestamp).strftime('%d.%m.%Y %H:%M')
    except:
        return "Неизвестно"

@app.template_filter('time_ago')
def time_ago(timestamp):
    if not timestamp:
        return "давно"
    
    now = time.time()
    diff = now - timestamp
    
    if diff < 60:
        return "только что"
    elif diff < 3600:
        minutes = math.floor(diff / 60)
        return f"{minutes} мин назад"
    elif diff < 86400:
        hours = math.floor(diff / 3600)
        return f"{hours} ч назад"
    elif diff < 2592000:
        days = math.floor(diff / 86400)
        return f"{days} д назад"
    else:
        return datetime.fromtimestamp(timestamp).strftime('%d.%m.%Y')

@app.route('/quick_chat/<user_id>')
@require_auth
def quick_chat(user_id):
    current_user_id = session['user_id']
    
    if user_id not in users:
        return render_template('error.html', error="Пользователь не найден"), 404
    
    room_id = create_private_room(current_user_id, user_id)
    session['room'] = room_id
    return redirect(url_for('room'))

@app.route('/direct_message/<user_id>')
@require_auth
def direct_message(user_id):
    current_user_id = session['user_id']
    
    if user_id not in users:
        return render_template('error.html', error="Пользователь не найден"), 404
    
    room_id = create_private_room(current_user_id, user_id)
    session['room'] = room_id
    return redirect(url_for('room'))

# ----- Security headers -----
@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response

@app.get('/api/check-room')
def api_check_room():
    code = request.args.get('code', '').strip()
    if not code:
        return jsonify({'exists': False})
    
    exists = code in rooms
    print(f"Room check: {code} -> {exists}")
    return jsonify({'exists': exists})





# ----- Run -----
if __name__ == "__main__":
    socketio.run(app, debug=True)