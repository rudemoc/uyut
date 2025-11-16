// static/room.js - Mobile Optimized
class RoomChat {
    constructor(config) {
        console.log('RoomChat initializing with config:', config);
        
        this.socket = io();
        
        // DOM elements
        this.messagesDiv = document.getElementById('messages');
        this.imageViewer = document.getElementById('image-viewer');
        this.viewerImage = document.getElementById('viewer-image');
        this.closeViewerButton = document.getElementById('close-viewer');
        this.editor = document.getElementById('message-editor');
        this.boldBtn = document.getElementById('bold-btn');
        this.italicBtn = document.getElementById('italic-btn');
        this.sizeSelect = document.getElementById('size-select');
        this.emojiBtn = document.getElementById('emoji-btn');
        this.emojiPicker = document.getElementById('emoji-picker');
        this.closeEmojiPicker = document.getElementById('close-emoji-picker');
        this.fileInput = document.getElementById('file-input');
        this.fileInputButton = document.querySelector('.file-input-button');
        this.resizerTop = document.querySelector('.resizer-top');
        this.sendButton = document.getElementById('send-button');
        this.sendContainer = document.getElementById('send-container');
        this.cooldownOverlay = document.getElementById('cooldown-overlay');
        this.cooldownSeconds = document.getElementById('cooldown-seconds');
        this.charCounter = document.getElementById('char-counter');
        this.messageContextMenu = null;
        this.selectedMessage = null;
        this.longPressTimer = null;
        this.longPressDuration = 250; // ms
        
        // Configuration
        this.initialMessages = Array.isArray(config.initialMessages) ? config.initialMessages : [];
        this.defaultAvatar = config.defaultAvatar || '';
        this.userId = config.userId || '';
        this.userName = config.userName || '';
        this.userAvatar = config.userAvatar || '';
        
        // State
        this.cooldownTime = 1000;
        this.currentCooldown = 0;
        this.cooldownTimer = null;
        this.spamCount = 0;
        this.MAX_COOLDOWN = 30000;

        this.isResizing = false;
        this.startY = 0;
        this.startHeight = 0;
        this.MIN_EDITOR_HEIGHT = 80;
        this.MAX_EDITOR_HEIGHT = window.innerHeight * 0.6;

        // Image viewer state
        this.zoomScale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.lastTouchX = 0;
        this.lastTouchY = 0;
        this.ZOOM_STEP = 0.1;
        this.MAX_ZOOM = 5;
        this.MIN_ZOOM = 0.5;

        // Bounds for image viewer
        this.maxTranslateX = 0;
        this.maxTranslateY = 0;
        this.minTranslateX = 0;
        this.minTranslateY = 0;

        // Scroll tracking
        this.isAtBottom = true;

        // Message limits
        this.MAX_MESSAGE_LENGTH = 512;

        // File handling
        this.uploadedFiles = [];

        // Touch and context menu
        this.longPressTimer = null;
        this.longPressDuration = 500; // ms
        this.currentContextMenu = null;

        this.init();
    }

    init() {
    console.log('Initializing RoomChat...');
    
    // Сохраняем текущую комнату в sessionStorage при загрузке
    const roomData = document.getElementById('room-data');
    if (roomData && roomData.dataset.roomCode) {
        sessionStorage.setItem('current_room', roomData.dataset.roomCode);
        console.log('Room saved to sessionStorage:', roomData.dataset.roomCode);
    }
    
    this.setupEventListeners();
    this.loadInitialMessages();
    this.setupSocketEvents();
    this.setupEmojiPicker();
    this.setupResizer();
    this.setupImageViewerControls();
    this.setupWindowResize();
    this.setupScrollTracking();
    this.setupCharCounter();
    this.setupTouchHandlers();
    this.setupAudioPlayers(); // Добавляем инициализацию аудио плееров
    this.setupContextMenu();
    this.setupMessageInteractions();
    console.log('RoomChat initialized successfully');
}

    setupTouchHandlers() {
        // Add touch event listeners for mobile
        if (this.editor) {
            this.editor.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
            this.editor.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: true });
        }

        // Setup long press for messages
        document.addEventListener('touchstart', this.handleMessageTouchStart.bind(this), { passive: true });
        document.addEventListener('touchend', this.handleMessageTouchEnd.bind(this));
        document.addEventListener('touchcancel', this.handleMessageTouchEnd.bind(this));
    }

    handleTouchStart(e) {
        // Handle touch events for editor
        if (e.touches.length === 2) {
            // Pinch to zoom for images in editor
            e.preventDefault();
        }
    }

    handleTouchMove(e) {
        // Handle touch move for editor
        if (e.touches.length === 2) {
            e.preventDefault();
        }
    }

    handleMessageTouchStart(e) {
        const messageElement = e.target.closest('.message');
        if (!messageElement) return;

        const messageIndex = Array.from(this.messagesDiv.children).indexOf(messageElement);
        if (messageIndex === -1) return;

        // Start long press timer
        this.longPressTimer = setTimeout(() => {
            
        }, this.longPressDuration);

        // Add visual feedback
        messageElement.classList.add('long-press-active');
    }

    handleMessageTouchEnd(e) {
        // Clear long press timer
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        // Remove visual feedback
        const messageElement = e.target.closest('.message');
        if (messageElement) {
            messageElement.classList.remove('long-press-active');
        }
    }

    setupCharCounter() {
        if (!this.editor || !this.charCounter) return;
        
        const updateCounter = () => {
            const text = this.editor.innerText || '';
            const length = text.length;
            this.charCounter.textContent = `${length}/${this.MAX_MESSAGE_LENGTH}`;
            
            if (length > this.MAX_MESSAGE_LENGTH) {
                this.charCounter.style.color = '#e0245e';
            } else {
                this.charCounter.style.color = '#8899a6';
            }
        };
        
        this.editor.addEventListener('input', updateCounter);
        this.editor.addEventListener('paste', updateCounter);
        
        updateCounter();
    }

    setupScrollTracking() {
        this.messagesDiv.addEventListener('scroll', () => {
            this.checkIfAtBottom();
        });
    }

    checkIfAtBottom() {
        const threshold = 50;
        const position = this.messagesDiv.scrollTop + this.messagesDiv.clientHeight;
        const height = this.messagesDiv.scrollHeight;
        
        this.isAtBottom = position >= height - threshold;
    }

    setupWindowResize() {
        window.addEventListener('resize', () => {
            this.MAX_EDITOR_HEIGHT = window.innerHeight * 0.6;
            
            const currentHeight = this.editor.offsetHeight;
            if (currentHeight > this.MAX_EDITOR_HEIGHT) {
                this.editor.style.height = `${this.MAX_EDITOR_HEIGHT}px`;
            }
        });
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Toolbar buttons
        if (this.boldBtn) {
            this.boldBtn.addEventListener('click', () => this.formatText('bold'));
            this.boldBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.formatText('bold');
            }, { passive: false });
        }
        
        if (this.italicBtn) {
            this.italicBtn.addEventListener('click', () => this.formatText('italic'));
            this.italicBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.formatText('italic');
            }, { passive: false });
        }
        
        if (this.sizeSelect) {
            this.sizeSelect.addEventListener('change', (e) => this.changeFontSize(e.target.value));
        }
        
        if (this.emojiBtn) {
            this.emojiBtn.addEventListener('click', () => this.toggleEmojiPicker());
            this.emojiBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.toggleEmojiPicker();
            }, { passive: false });
        }
        
        if (this.closeEmojiPicker) {
            this.closeEmojiPicker.addEventListener('click', () => this.hideEmojiPicker());
        }
        
        // File input
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }
        
        if (this.fileInputButton) {
            this.fileInputButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.fileInput?.click();
            }, { passive: false });
        }
        
        // Send form
        if (this.sendContainer) {
            this.sendContainer.addEventListener('submit', (e) => this.handleSubmit(e));
        }
        
        // Image viewer
        if (this.closeViewerButton) {
            this.closeViewerButton.addEventListener('click', () => this.resetViewer());
            this.closeViewerButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.resetViewer();
            }, { passive: false });
        }
        
        if (this.imageViewer) {
            this.imageViewer.addEventListener('click', (e) => {
                if (e.target === this.imageViewer) this.resetViewer();
            });
            
            // Touch close
            this.imageViewer.addEventListener('touchstart', (e) => {
                if (e.target === this.imageViewer) {
                    e.preventDefault();
                    this.resetViewer();
                }
            }, { passive: false });
        }
        
        // Close emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (this.emojiBtn && this.emojiPicker) {
                if (!this.emojiBtn.contains(e.target) && !this.emojiPicker.contains(e.target)) {
                    this.hideEmojiPicker();
                }
            }
            
            // Close context menus
            if (this.currentContextMenu && !this.currentContextMenu.contains(e.target)) {
                this.currentContextMenu.remove();
                this.currentContextMenu = null;
            }
        });
        
        // Touch outside to close context menus
        document.addEventListener('touchstart', (e) => {
            if (this.currentContextMenu && !this.currentContextMenu.contains(e.target)) {
                this.currentContextMenu.remove();
                this.currentContextMenu = null;
            }
        }, { passive: true });
    }

    setupSocketEvents() {
    console.log('Setting up socket events...');
    
    this.socket.on('connect', () => {
        console.log('[Debug] WebSocket connected successfully');
    });
    
    this.socket.on('message', (msg) => {
        console.log('[Debug] Received message:', msg);
        this.addMessage(msg);
    });
    
    this.socket.on('message_deleted', (data) => {
        console.log('[Debug] Message deleted:', data);
        this.handleMessageDeleted(data);
    });

    // Добавляем обработчик редактирования сообщения
    this.socket.on('message_edited', (data) => {
        console.log('[Debug] Message edited:', data);
        this.handleMessageEdited(data);
    });

    this.socket.on('disconnect', () => {
        console.log('[Debug] WebSocket disconnected');
    });

    this.socket.on('error', (error) => {
        console.error('[Debug] WebSocket error:', error);
    });
}

handleMessageEdited(data) {
    // Находим элемент сообщения по ID
    const messageElement = this.messagesDiv.querySelector(`[data-message-id="${data.message_id}"]`);
    if (messageElement) {
        // Обновляем содержимое сообщения
        const messageText = messageElement.querySelector('.message-text');
        if (messageText) {
            messageText.innerHTML = data.new_content;
        }
        
        // Добавляем метку "ред."
        const editLabel = messageElement.querySelector('.edit-label') || document.createElement('span');
        if (!editLabel.classList.contains('edit-label')) {
            editLabel.className = 'edit-label';
            editLabel.style.cssText = 'color: #8899a6; font-size: 0.8em; margin-left: 5px; font-style: italic;';
            editLabel.textContent = 'ред.';
            
            const messageHeader = messageElement.querySelector('.message-header');
            if (messageHeader) {
                messageHeader.appendChild(editLabel);
            }
        }
        
        this.showMessageSuccess('Сообщение обновлено');
    }
}

    setupEmojiPicker() {
        if (!this.emojiPicker) return;
        
        this.emojiPicker.querySelectorAll('.emoji').forEach(emoji => {
            emoji.addEventListener('click', () => {
                this.insertEmoji(emoji.textContent);
            });
            
            emoji.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.insertEmoji(emoji.textContent);
            }, { passive: false });
        });
    }

    insertEmoji(emoji) {
        if (this.editor) {
            this.editor.focus();
            document.execCommand('insertText', false, emoji);
            if (this.charCounter) {
                const event = new Event('input');
                this.editor.dispatchEvent(event);
            }
        }
    }

    setupResizer() {
        if (!this.resizerTop) return;
        
        // Mouse events
        this.resizerTop.addEventListener('mousedown', (e) => {
            this.startResizing(e.clientY);
            e.preventDefault();
        });

        // Touch events
        this.resizerTop.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.startResizing(e.touches[0].clientY);
                e.preventDefault();
            }
        }, { passive: false });

        const handleMove = (clientY) => {
            if (!this.isResizing) return;
            const delta = this.startY - clientY;
            const newHeight = this.startHeight + delta;
            
            this.editor.style.height = `${Math.max(this.MIN_EDITOR_HEIGHT, Math.min(this.MAX_EDITOR_HEIGHT, newHeight))}px`;
            this.scrollToBottom();
        };

        // Mouse move
        window.addEventListener('mousemove', (e) => {
            handleMove(e.clientY);
        });

        // Touch move
        window.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && this.isResizing) {
                handleMove(e.touches[0].clientY);
                e.preventDefault();
            }
        }, { passive: false });

        const stopResizing = () => {
            this.isResizing = false;
        };

        window.addEventListener('mouseup', stopResizing);
        window.addEventListener('touchend', stopResizing);
        window.addEventListener('touchcancel', stopResizing);

        // Double click/tap to reset
        this.resizerTop.addEventListener('dblclick', () => {
            this.editor.style.height = `${this.MIN_EDITOR_HEIGHT}px`;
        });
        
        this.resizerTop.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                this.editor.style.height = `${this.MIN_EDITOR_HEIGHT}px`;
                e.preventDefault();
            }
        }, { passive: false });
    }

    startResizing(clientY) {
        this.isResizing = true;
        this.startY = clientY;
        this.startHeight = this.editor.offsetHeight;
    }

    setupImageViewerControls() {
        if (!this.imageViewer) return;
        
        // Mouse wheel zoom
        this.imageViewer.addEventListener('wheel', (e) => {
            if (!this.viewerImage.src) return;
            e.preventDefault();
            this.handleZoom(e.deltaY, e.clientX, e.clientY);
        }, { passive: false });

        // Touch zoom and pan
        let initialDistance = null;
        
        this.imageViewer.addEventListener('touchstart', (e) => {
            if (!this.viewerImage.src) return;
            
            if (e.touches.length === 2) {
                // Pinch to zoom
                initialDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                e.preventDefault();
            } else if (e.touches.length === 1 && this.zoomScale > 1) {
                // Single touch pan
                this.isDragging = true;
                this.lastTouchX = e.touches[0].clientX;
                this.lastTouchY = e.touches[0].clientY;
                this.viewerImage.style.cursor = 'grabbing';
                e.preventDefault();
            }
        }, { passive: false });

        this.imageViewer.addEventListener('touchmove', (e) => {
            if (!this.viewerImage.src) return;
            
            if (e.touches.length === 2 && initialDistance !== null) {
                // Handle pinch zoom
                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                
                const delta = initialDistance - currentDistance;
                this.handleZoom(delta * 2, e.touches[0].clientX, e.touches[0].clientY);
                initialDistance = currentDistance;
                e.preventDefault();
            } else if (e.touches.length === 1 && this.isDragging) {
                // Handle pan
                const deltaX = e.touches[0].clientX - this.lastTouchX;
                const deltaY = e.touches[0].clientY - this.lastTouchY;
                
                this.translateX += deltaX;
                this.translateY += deltaY;
                
                this.constrainTranslation();
                this.updateTransform();
                
                this.lastTouchX = e.touches[0].clientX;
                this.lastTouchY = e.touches[0].clientY;
                e.preventDefault();
            }
        }, { passive: false });

        this.imageViewer.addEventListener('touchend', (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                this.updateCursor();
            }
            initialDistance = null;
        });

        // Mouse drag
        this.viewerImage.addEventListener('mousedown', (e) => {
            if (!this.viewerImage.src) return;
            
            this.isDragging = true;
            this.lastTouchX = e.clientX;
            this.lastTouchY = e.clientY;
            this.viewerImage.style.cursor = 'grabbing';
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            const deltaX = e.clientX - this.lastTouchX;
            const deltaY = e.clientY - this.lastTouchY;
            
            this.translateX += deltaX;
            this.translateY += deltaY;
            
            this.constrainTranslation();
            this.updateTransform();
            
            this.lastTouchX = e.clientX;
            this.lastTouchY = e.clientY;
        });

        window.addEventListener('mouseup', (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                this.updateCursor();
            }
        });

        // Double click/tap to reset
        this.viewerImage.addEventListener('dblclick', (e) => {
            this.zoomScale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.updateTransform();
            this.updateCursor();
        });
        
        this.viewerImage.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                // Double tap with two fingers to reset
                this.zoomScale = 1;
                this.translateX = 0;
                this.translateY = 0;
                this.updateTransform();
                this.updateCursor();
                e.preventDefault();
            }
        }, { passive: false });

        window.addEventListener('resize', () => {
            this.calculateBounds();
            this.constrainTranslation();
            this.updateTransform();
        });
    }

    handleZoom(delta, clientX, clientY) {
        const rect = this.viewerImage.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        const oldScale = this.zoomScale;
        
        if (delta < 0) {
            this.zoomScale = Math.min(this.MAX_ZOOM, this.zoomScale + this.ZOOM_STEP);
        } else {
            this.zoomScale = Math.max(this.MIN_ZOOM, this.zoomScale - this.ZOOM_STEP);
        }

        const scaleChange = this.zoomScale / oldScale;
        this.translateX = mouseX - (mouseX - this.translateX) * scaleChange;
        this.translateY = mouseY - (mouseY - this.translateY) * scaleChange;

        this.calculateBounds();
        this.constrainTranslation();
        this.updateTransform();
        this.updateCursor();
    }

    calculateBounds() {
        if (!this.viewerImage || !this.imageViewer) return;
        
        const imgRect = this.viewerImage.getBoundingClientRect();
        const viewerRect = this.imageViewer.getBoundingClientRect();
        
        const scaledWidth = imgRect.width * this.zoomScale;
        const scaledHeight = imgRect.height * this.zoomScale;
        
        this.maxTranslateX = Math.max(0, (scaledWidth - viewerRect.width) / 2);
        this.minTranslateX = -this.maxTranslateX;
        this.maxTranslateY = Math.max(0, (scaledHeight - viewerRect.height) / 2);
        this.minTranslateY = -this.maxTranslateY;
    }

    constrainTranslation() {
        this.translateX = Math.max(this.minTranslateX, Math.min(this.maxTranslateX, this.translateX));
        this.translateY = Math.max(this.minTranslateY, Math.min(this.maxTranslateY, this.translateY));
    }

    updateCursor() {
        if (!this.viewerImage) return;
        
        if (this.zoomScale > 1) {
            this.viewerImage.style.cursor = this.isDragging ? 'grabbing' : 'grab';
        } else {
            this.viewerImage.style.cursor = 'default';
        }
    }

    updateTransform() {
        if (this.viewerImage) {
            this.viewerImage.style.transform =
                `translate(${this.translateX}px, ${this.translateY}px) scale(${this.zoomScale})`;
        }
    }

    loadInitialMessages() {
        console.log('Loading initial messages:', this.initialMessages);
        
        this.initialMessages.forEach(msg => this.addMessage(msg, false));
        
        setTimeout(() => {
            this.scrollToBottom();
        }, 100);
    }

    addMessage(msg, smoothScroll = true) {
    if (!msg || (!msg.sender && msg.sender !== '' && msg.sender !== 'System') || (!msg.message && !msg.file)) {
        console.log('[Debug] Skipping invalid message:', msg);
        return;
    }

    // Check if message is deleted
    if (msg.deleted) {
        this.addDeletedMessage(msg, smoothScroll);
        return;
    }

    console.log('[Debug] Adding message:', msg);

    const wasAtBottom = this.isAtBottom;


    const msgElem = document.createElement('div');
    msgElem.classList.add('message');
    msgElem.dataset.timestamp = msg.timestamp;
    msgElem.dataset.userId = msg.user_id;
    msgElem.dataset.messageId = msg.id || msg.timestamp; // Уникальный ID сообщения


    const avatar = msg.avatar ? `data:image/png;base64,${msg.avatar}` : `data:image/png;base64,${this.defaultAvatar}`;

    const left = document.createElement('div');
    left.className = 'avatar-container';
    left.style.position = 'relative';
    
    const avatarImg = document.createElement('img');
    avatarImg.className = 'avatar clickable-avatar';
    avatarImg.src = avatar;
    
    // Add context menu handlers
    if (msg.user_id && msg.user_id !== this.userId) {
        avatarImg.style.cursor = 'pointer';
        
        // Click for profile
        avatarImg.addEventListener('click', (e) => {
            this.openUserProfile(msg.user_id);
        });
        
        // Right click/long press for context menu
        avatarImg.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showAvatarContextMenu(e, msg.user_id, msg.sender);
        });
    }

    left.appendChild(avatarImg);
    
    const payload = document.createElement('div');
    payload.className = 'payload';

    if (msg.sender === 'System') {
        payload.innerHTML = `<div class="system-message"><em>${msg.message || ''}</em></div>`;
    } else {
        const sanitizedSender = msg.sender ? msg.sender.replace(/[^A-Za-z0-9_]/g, '') : 'user';
        const header = `<div class="message-header"><strong>${msg.sender}</strong> <span class="username">@${sanitizedSender}</span></div>`;
        
        let messageContent = msg.message ? `<div class="message-text">${msg.message}</div>` : '';
        
        // Добавляем медиа файлы
        if (msg.file) {
            if (msg.file.kind === 'audio') {
                messageContent += this.createAudioPlayer(msg.file);
            } else if (msg.file.kind === 'video') {
                messageContent += this.createVideoPlayer(msg.file);
            } else if (msg.file.kind === 'image') {
                messageContent += this.createImagePreview(msg.file);
            } else {
                messageContent += this.createFilePreview(msg.file);
            }
        }
        
        payload.innerHTML = header + messageContent;
    }

    msgElem.appendChild(left);
    msgElem.appendChild(payload);
    this.messagesDiv.appendChild(msgElem);

    // Add context menu to the entire message
    

    this.attachMediaClickHandlers(payload);
    this.initializeAllAudioPlayers(); // Инициализируем аудио плееры для нового сообщения
    this.addMessageInteractions(msgElem, msg);

    if (wasAtBottom && smoothScroll) {
        setTimeout(() => {
            this.scrollToBottom();
        }, 50);
    }

    
}

createAudioPlayer(file) {
    return `
        <div class="audio-container">
            <div class="audio-header">
                <div class="audio-icon">🎵</div>
                <div class="audio-info">
                    <div class="audio-title">Аудио сообщение</div>
                    <div class="audio-duration">0:00</div>
                </div>
            </div>
            <div class="audio-controls">
                <button class="play-pause-btn">▶️</button>
                <div class="progress-container">
                    <div class="progress-bar"></div>
                </div>
                <div class="time-display">
                    <span class="current-time">0:00</span> / <span class="duration">0:00</span>
                </div>
                <div class="volume-control">
                    <span class="volume-icon">🔊</span>
                    <div class="volume-slider">
                        <div class="volume-level"></div>
                    </div>
                </div>
            </div>
            <div class="audio-waves">
                <div class="wave"></div>
                <div class="wave"></div>
                <div class="wave"></div>
                <div class="wave"></div>
                <div class="wave"></div>
            </div>
            <audio class="audio-preview" preload="metadata" controlsList="nodownload">
                <source src="${file.url}" type="${file.type}">
                Ваш браузер не поддерживает аудио элементы.
            </audio>
        </div>
    `;
}

createVideoPlayer(file) {
    return `
        <div class="video-container">
            <video class="media-preview video-preview" controls preload="metadata" controlsList="nodownload" playsinline>
                <source src="${file.url}" type="${file.type}">
                Ваш браузер не поддерживает видео.
            </video>
            <div class="video-overlay">
                <div class="video-controls">
                    <button class="video-play-btn">▶️</button>
                    <div class="video-progress">
                        <div class="video-progress-bar"></div>
                    </div>
                    <div class="video-time">0:00 / 0:00</div>
                </div>
            </div>
        </div>
    `;
}

createImagePreview(file) {
    return `
        <div class="image-container">
            <img src="${file.url}" alt="Изображение" class="media-preview image-preview" loading="lazy">
        </div>
    `;
}

createFilePreview(file) {
    return `
        <div class="file-container">
            <a href="${file.url}" download="${file.name}" class="file-preview">
                <div class="file-icon">📎</div>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${this.formatFileSize(file.size)}</div>
                </div>
            </a>
        </div>
    `;
}

    setupAudioPlayers() {
    // Обработчики для кастомного аудио плеера
    document.addEventListener('click', (e) => {
        const audioContainer = e.target.closest('.audio-container');
        if (!audioContainer) return;
        
        if (e.target.closest('.play-pause-btn')) {
            this.toggleAudioPlayback(audioContainer);
        }
        
        if (e.target.closest('.progress-container')) {
            this.seekAudio(audioContainer, e);
        }
        
        if (e.target.closest('.volume-slider')) {
            this.adjustVolume(audioContainer, e);
        }
    });
    
    // Инициализация существующих аудио элементов
    this.initializeAllAudioPlayers();
}

initializeAllAudioPlayers() {
    document.querySelectorAll('.audio-container').forEach(container => {
        const audio = container.querySelector('.audio-preview');
        if (audio) {
            this.enhanceAudioPlayer(audio);
        }
    });
}

enhanceAudioPlayer(audioElement) {
    const container = audioElement.closest('.audio-container');
    if (!container) return;
    
    const audio = audioElement;
    const playPauseBtn = container.querySelector('.play-pause-btn');
    const progressBar = container.querySelector('.progress-bar');
    const currentTimeEl = container.querySelector('.current-time');
    const durationEl = container.querySelector('.duration');
    const volumeLevel = container.querySelector('.volume-level');
    const waves = container.querySelectorAll('.wave');
    
    // Устанавливаем длительность когда метаданные загружены
    audio.addEventListener('loadedmetadata', () => {
        if (durationEl) {
            durationEl.textContent = this.formatTime(audio.duration);
        }
    });
    
    // Обновление прогресса воспроизведения
    audio.addEventListener('timeupdate', () => {
        if (progressBar && audio.duration) {
            const progress = (audio.currentTime / audio.duration) * 100;
            progressBar.style.width = `${progress}%`;
        }
        
        if (currentTimeEl) {
            currentTimeEl.textContent = this.formatTime(audio.currentTime);
        }
        
        // Анимация волн при воспроизведении
        if (waves.length > 0) {
            if (!audio.paused) {
                waves.forEach(wave => wave.style.animationPlayState = 'running');
            } else {
                waves.forEach(wave => wave.style.animationPlayState = 'paused');
            }
        }
    });
    
    // Обновление иконки воспроизведения/паузы
    audio.addEventListener('play', () => {
        if (playPauseBtn) {
            playPauseBtn.innerHTML = '⏸️';
            playPauseBtn.classList.add('playing');
        }
    });
    
    audio.addEventListener('pause', () => {
        if (playPauseBtn) {
            playPauseBtn.innerHTML = '▶️';
            playPauseBtn.classList.remove('playing');
        }
    });
    
    // Обработка окончания трека
    audio.addEventListener('ended', () => {
        if (playPauseBtn) {
            playPauseBtn.innerHTML = '▶️';
            playPauseBtn.classList.remove('playing');
        }
        if (progressBar) {
            progressBar.style.width = '0%';
        }
        if (currentTimeEl) {
            currentTimeEl.textContent = '0:00';
        }
    });
}

toggleAudioPlayback(container) {
    const audio = container.querySelector('.audio-preview');
    if (!audio) return;
    
    if (audio.paused) {
        audio.play().catch(e => console.error('Audio play failed:', e));
    } else {
        audio.pause();
    }
}

seekAudio(container, event) {
    const audio = container.querySelector('.audio-preview');
    const progressContainer = container.querySelector('.progress-container');
    if (!audio || !progressContainer) return;
    
    const rect = progressContainer.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audio.duration;
}

adjustVolume(container, event) {
    const audio = container.querySelector('.audio-preview');
    const volumeSlider = container.querySelector('.volume-slider');
    const volumeLevel = container.querySelector('.volume-level');
    if (!audio || !volumeSlider) return;
    
    const rect = volumeSlider.getBoundingClientRect();
    const volume = (event.clientX - rect.left) / rect.width;
    const clampedVolume = Math.max(0, Math.min(1, volume));
    
    audio.volume = clampedVolume;
    if (volumeLevel) {
        volumeLevel.style.width = `${clampedVolume * 100}%`;
    }
}

formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

    addDeletedMessage(msg, smoothScroll = true) {
        const wasAtBottom = this.isAtBottom;

        const msgElem = document.createElement('div');
        msgElem.classList.add('message');
        msgElem.style.opacity = '0.6';

        const payload = document.createElement('div');
        payload.className = 'payload';
        payload.innerHTML = `<em>${msg.message || 'Сообщение было удалено'}</em>`;

        msgElem.appendChild(payload);
        this.messagesDiv.appendChild(msgElem);

        if (wasAtBottom && smoothScroll) {
            setTimeout(() => {
                this.scrollToBottom();
            }, 50);
        }
    }


    addMessageInteractions(messageElement, msg) {
        const isOwnMessage = msg.user_id === this.userId;

        // Правый клик (десктоп)
        messageElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e, messageElement, msg, isOwnMessage);
        });

        // Долгое нажатие (мобильные)
        let pressTimer;
        
        messageElement.addEventListener('touchstart', (e) => {
            pressTimer = setTimeout(() => {
                this.showContextMenu(e, messageElement, msg, isOwnMessage);
            }, this.longPressDuration);
            
            // Добавляем визуальную обратную связь
            messageElement.classList.add('selected');
        }, { passive: true });

        messageElement.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
        });

        messageElement.addEventListener('touchmove', () => {
            clearTimeout(pressTimer);
            messageElement.classList.remove('selected');
        });

        messageElement.addEventListener('touchcancel', () => {
            clearTimeout(pressTimer);
            messageElement.classList.remove('selected');
        });
    }

    showContextMenu(e, messageElement, msg, isOwnMessage) {
        if (!this.messageContextMenu) return;

        // Сохраняем выбранное сообщение
        this.selectedMessage = {
            element: messageElement,
            data: msg,
            isOwn: isOwnMessage
        };

        // Показываем/скрываем пункты меню в зависимости от прав
        const editItem = this.messageContextMenu.querySelector('[data-action="edit"]');
        const deleteItem = this.messageContextMenu.querySelector('[data-action="delete"]');
        
        if (editItem) {
            editItem.style.display = isOwnMessage ? 'flex' : 'none';
        }
        
        if (deleteItem) {
            deleteItem.style.display = isOwnMessage ? 'flex' : 'none';
        }

        // Позиционирование для мобильных
        if (window.innerWidth <= 768) {
            this.messageContextMenu.style.bottom = '0';
            this.messageContextMenu.style.top = 'auto';
            this.messageContextMenu.style.left = '50%';
            this.messageContextMenu.style.transform = 'translateX(-50%)';
        } else {
            // Позиционирование для десктопа
            const rect = messageElement.getBoundingClientRect();
            const menuRect = this.messageContextMenu.getBoundingClientRect();
            
            let left = e.clientX;
            let top = e.clientY;

            // Проверяем, чтобы меню не выходило за границы экрана
            if (left + menuRect.width > window.innerWidth) {
                left = window.innerWidth - menuRect.width - 10;
            }
            
            if (top + menuRect.height > window.innerHeight) {
                top = window.innerHeight - menuRect.height - 10;
            }

            this.messageContextMenu.style.left = left + 'px';
            this.messageContextMenu.style.top = top + 'px';
            this.messageContextMenu.style.transform = 'none';
        }

        // Показываем меню
        this.messageContextMenu.classList.remove('hidden');
        
        // Блокируем прокрутку на мобильных
        if (window.innerWidth <= 768) {
            document.body.style.overflow = 'hidden';
        }

        // Выделяем сообщение
        messageElement.classList.add('selected');
    }


    hideContextMenu() {
        if (this.messageContextMenu) {
            this.messageContextMenu.classList.add('hidden');
        }
        
        // Снимаем выделение с сообщения
        if (this.selectedMessage) {
            this.selectedMessage.element.classList.remove('selected');
            this.selectedMessage = null;
        }
        
        // Разблокируем прокрутку
        document.body.style.overflow = '';
    }


    handleContextMenuAction(action) {
        if (!this.selectedMessage) return;

        switch (action) {
            case 'copy':
                this.copyMessageText(this.selectedMessage.data);
                break;
                
            case 'edit':
                this.editMessage(this.selectedMessage);
                break;
                
            case 'delete':
                this.deleteMessageFromContext();
                break;
                
            case 'reply':
                this.replyToMessage(this.selectedMessage);
                break;
                
            default:
                // Отмена или другие действия
                break;
        }
        
        this.hideContextMenu();
    }

    copyMessageText(message) {
        const text = message.message ? message.message.replace(/<[^>]*>/g, '') : '';
        
        navigator.clipboard.writeText(text).then(() => {
            this.showMessageSuccess('Текст скопирован в буфер обмена');
        }).catch(() => {
            // Fallback для старых браузеров
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showMessageSuccess('Текст скопирован');
        });
    }

    editMessage(selectedMessage) {
        const message = selectedMessage.data;
        const messageElement = selectedMessage.element;
        
        // Получаем чистый текст сообщения
        const rawText = message.message ? message.message.replace(/<[^>]*>/g, '') : '';
        
        // Вставляем текст в редактор
        if (this.editor) {
            this.editor.innerHTML = '';
            this.editor.focus();
            document.execCommand('insertText', false, rawText);
            
            // Показываем режим редактирования
            this.showEditMode(message);
        }
    }

    showEditMode(message) {
        // Изменяем кнопку отправки на "Сохранить"
        const sendButton = document.getElementById('send-button');
        if (sendButton) {
            const originalText = sendButton.textContent;
            sendButton.textContent = '💾 Сохранить';
            sendButton.dataset.originalText = originalText;
            sendButton.dataset.editingMessageId = message.id || message.timestamp;
        }
        
        this.showMessageSuccess('Режим редактирования. Измените текст и нажмите "Сохранить"');
    }

    exitEditMode() {
        const sendButton = document.getElementById('send-button');
        if (sendButton && sendButton.dataset.originalText) {
            sendButton.textContent = sendButton.dataset.originalText;
            delete sendButton.dataset.originalText;
            delete sendButton.dataset.editingMessageId;
        }
    }

    deleteMessageFromContext() {
        if (!this.selectedMessage) return;
        
        const messageIndex = Array.from(this.messagesDiv.children).indexOf(this.selectedMessage.element);
        const timestamp = this.selectedMessage.data.timestamp;
        
        this.deleteMessage(messageIndex, timestamp);
    }

    replyToMessage(selectedMessage) {
        const message = selectedMessage.data;
        const sender = message.sender || 'Пользователь';
        const preview = message.message ? message.message.replace(/<[^>]*>/g, '').substring(0, 50) + '...' : '';
        
        // Добавляем цитирование в редактор
        if (this.editor) {
            this.editor.focus();
            const quoteText = `> Ответ на сообщение от ${sender}: ${preview}\n\n`;
            document.execCommand('insertText', false, quoteText);
        }
        
        this.showMessageSuccess(`Ответ на сообщение от ${sender}`);
    }


    

    deleteMessage(messageIndex, timestamp) {
    // ВСЕ способы получить код комнаты по порядку
    let roomCode = '';
    
    // 1. Из data-атрибута (основной способ)
    const roomData = document.getElementById('room-data');
    if (roomData && roomData.dataset.roomCode) {
        roomCode = roomData.dataset.roomCode;
        console.log('Room code from data attribute:', roomCode);
    }
    
    // 2. Из URL (резервный способ)
    if (!roomCode) {
        const pathParts = window.location.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart && lastPart.length > 5) { // Предполагаем, что коды комнат длинные
            roomCode = lastPart;
            console.log('Room code from URL:', roomCode);
        }
    }
    
    // 3. Из sessionStorage (если уже сохраняли)
    if (!roomCode) {
        roomCode = sessionStorage.getItem('current_room');
        console.log('Room code from sessionStorage:', roomCode);
    }
    
    // 4. Для приватных сообщений - специальная обработка
    if (!roomCode && window.location.pathname.includes('direct_message')) {
        const userIdMatch = window.location.pathname.match(/direct_message\/(.+)/);
        if (userIdMatch && userIdMatch[1]) {
            // Для приватных чатов код формируется особым образом
            const currentUserId = roomData ? roomData.dataset.userId : '';
            const otherUserId = userIdMatch[1];
            if (currentUserId && otherUserId) {
                roomCode = `private_${Math.min(currentUserId, otherUserId)}_${Math.max(currentUserId, otherUserId)}`;
                console.log('Generated private room code:', roomCode);
            }
        }
    }

    console.log('Final room code for deletion:', roomCode);
    
    if (!roomCode) {
        console.error('Room code not found. Available data:', {
            dataAttribute: roomData ? roomData.dataset.roomCode : 'no roomData element',
            url: window.location.pathname,
            sessionStorage: sessionStorage.getItem('current_room'),
            isDirectMessage: window.location.pathname.includes('direct_message')
        });
        this.showMessageError('Не удалось определить комнату. Попробуйте перезагрузить страницу.');
        return;
    }

    // Дополнительная проверка: убедимся, что комната существует
    fetch(`/api/check-room?code=${encodeURIComponent(roomCode)}`)
        .then(response => response.json())
        .then(data => {
            if (!data.exists) {
                this.showMessageError('Комната не найдена или была удалена');
                return;
            }
            
            // Если комната существует - отправляем запрос на удаление
            return fetch('/delete_message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    room_code: roomCode,
                    message_index: messageIndex,
                    timestamp: timestamp
                })
            });
        })
        .then(response => response ? response.json() : {success: false})
        .then(data => {
            if (data.success) {
                console.log('Message deleted successfully');
                this.showMessageSuccess('Сообщение удалено');
            } else {
                console.error('Failed to delete message:', data.error);
                this.showMessageError('Не удалось удалить сообщение: ' + (data.error || 'неизвестная ошибка'));
            }
        })
        .catch(error => {
            console.error('Error deleting message:', error);
            this.showMessageError('Ошибка при удалении сообщения');
        });
}

    handleMessageDeleted(data) {
        const messageIndex = data.message_index;
        const messageElement = this.messagesDiv.children[messageIndex];
        
        if (messageElement) {
            messageElement.style.opacity = '0.6';
            const payload = messageElement.querySelector('.payload');
            if (payload) {
                payload.innerHTML = '<em>Сообщение было удалено</em>';
            }
            
            // Remove context menu handlers
            messageElement.oncontextmenu = null;
        }
    }

    copyMessageText(message) {
        const text = message.message ? message.message.replace(/<[^>]*>/g, '') : '';
        navigator.clipboard.writeText(text).then(() => {
            this.showMessageSuccess('Текст скопирован');
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showMessageSuccess('Текст скопирован');
        });
    }

    showAvatarContextMenu(event, userId, userName) {
        const existingMenu = document.getElementById('avatar-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
        
        const menu = document.createElement('div');
        menu.id = 'avatar-context-menu';
        menu.className = 'message-context-menu';
        
        const clientX = event.clientX || (event.touches && event.touches[0].clientX) || 0;
        const clientY = event.clientY || (event.touches && event.touches[0].clientY) || 0;
        
        menu.style.left = `${clientX}px`;
        menu.style.top = `${clientY}px`;
        
        const profileOption = document.createElement('div');
        profileOption.className = 'context-menu-item';
        profileOption.textContent = `👤 Профиль ${userName}`;
        profileOption.addEventListener('click', () => {
            this.openUserProfile(userId);
            menu.remove();
        });
        
        const chatOption = document.createElement('div');
        chatOption.className = 'context-menu-item';
        chatOption.textContent = '💬 Личное сообщение';
        chatOption.addEventListener('click', () => {
            this.startDirectMessage(userId);
            menu.remove();
        });
        
        menu.appendChild(profileOption);
        menu.appendChild(chatOption);
        
        document.body.appendChild(menu);
        this.currentContextMenu = menu;

        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
                document.removeEventListener('touchstart', closeMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
            document.addEventListener('touchstart', closeMenu, { passive: true });
        }, 100);
    }

    openUserProfile(userId) {
        window.open(`/user/${userId}`, '_blank');
    }

    startDirectMessage(userId) {
        window.location.href = `/direct_message/${userId}`;
    }

    enhanceMediaElements(htmlContent) {
        // Add mobile-friendly attributes to media elements
        return htmlContent
            .replace(
                /<img([^>]*)>/g, 
                '<img$1 class="media-preview image-preview" loading="lazy" style="max-width:100%; height:auto; border-radius:12px; cursor:pointer;">'
            )
            .replace(
                /<video([^>]*)>/g, 
                '<video$1 class="media-preview video-preview" preload="metadata" controlsList="nodownload" style="max-width:100%; height:auto; border-radius:12px; background:#000;" playsinline>'
            )
            .replace(
                /<audio([^>]*)>/g,
                '<audio$1 class="media-preview audio-preview" preload="metadata" controlsList="nodownload" style="width:100%; margin:10px 0;">'
            );
    }

    enhanceExistingMedia(container) {
        // Enhance all media elements in the container
        container.querySelectorAll('img.media-preview').forEach(img => {
            img.loading = 'lazy';
            img.style.cursor = 'pointer';
        });
        
        container.querySelectorAll('video.media-preview').forEach(video => {
            video.setAttribute('preload', 'metadata');
            video.setAttribute('controlsList', 'nodownload');
            video.setAttribute('playsinline', '');
            video.style.maxWidth = '100%';
            video.style.height = 'auto';
            
            video.addEventListener('waiting', () => {
                video.style.opacity = '0.7';
            });
            
            video.addEventListener('canplay', () => {
                video.style.opacity = '1';
            });
            
            video.addEventListener('error', (e) => {
                console.error('Video error:', e);
                video.style.opacity = '0.5';
            });
        });
    }

    attachMediaClickHandlers(container) {
        container.querySelectorAll('img.media-preview').forEach(img => {
            img.addEventListener('click', () => {
                this.viewerImage.src = img.src;
                this.imageViewer.classList.remove('hidden');
                this.zoomScale = 1;
                this.translateX = 0;
                this.translateY = 0;
                
                this.viewerImage.onload = () => {
                    this.calculateBounds();
                    this.updateTransform();
                    this.updateCursor();
                };
                
                if (this.viewerImage.complete) {
                    this.calculateBounds();
                    this.updateTransform();
                    this.updateCursor();
                }
            });
        });
    }
    
    scrollToBottom() {
        if (this.messagesDiv) {
            this.messagesDiv.scrollTo({
                top: this.messagesDiv.scrollHeight,
                behavior: 'smooth'
            });
            this.isAtBottom = true;
        }
    }

    formatText(command) {
        if (this.editor) {
            this.editor.focus();
            document.execCommand(command);
        }
    }

    changeFontSize(size) {
        if (size && this.editor) {
            this.editor.focus();
            document.execCommand('fontSize', false, size);
            if (this.sizeSelect) {
                this.sizeSelect.value = '';
            }
        }
    }

    toggleEmojiPicker() {
        if (this.emojiPicker) {
            this.emojiPicker.classList.toggle('hidden');
        }
    }

    hideEmojiPicker() {
        if (this.emojiPicker) {
            this.emojiPicker.classList.add('hidden');
        }
    }

    async handleFileUpload(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        
        const maxSize = 400 * 1024 * 1024;
        
        for (const file of files) {
            if (file.size > maxSize) {
                alert(`Файл "${file.name}" слишком большой. Максимальный размер: 400 МБ.`);
                this.fileInput.value = '';
                return;
            }
        }
        
        const totalSize = files.reduce((acc, file) => acc + file.size, 0);
        if (totalSize > maxSize) {
            alert(`Общий размер файлов превышает 400 МБ. Выберите меньше файлов.`);
            this.fileInput.value = '';
            return;
        }
        
        try {
            for (const file of files) {
                const meta = await this.uploadFile(file);
                this.uploadedFiles.push(meta);
                
                let insertHtml = '';
                const sizeInfo = `<div class="file-size">${this.formatFileSize(file.size)}</div>`;
                
                if (meta.kind === 'image') {
                    insertHtml = `<div><img src="${meta.url}" alt="${meta.name}" class="media-preview image-preview" loading="lazy">${sizeInfo}</div>`;
                } else if (meta.kind === 'video') {
                    insertHtml = `
                        <div class="video-container" style="position:relative; max-width:100%; margin:10px 0;">
                            <video 
                                src="${meta.url}" 
                                controls 
                                preload="metadata"
                                controlsList="nodownload"
                                class="media-preview video-preview"
                                playsinline
                            >
                                Ваш браузер не поддерживает видео.
                            </video>
                            ${sizeInfo}
                        </div>
                    `;
                } else if (meta.kind === 'audio') {
                    insertHtml = `<div><audio src="${meta.url}" controls preload="metadata" class="media-preview audio-preview"></audio>${sizeInfo}</div>`;
                } else if (meta.kind === 'file') {
                    insertHtml = `<div><a href="${meta.url}" download="${meta.name}" class="file-preview">📎 ${meta.name}</a>${sizeInfo}</div>`;
                }
                
                if (insertHtml && this.editor) {
                    this.editor.focus();
                    document.execCommand('insertHTML', false, insertHtml + ' ');
                    if (this.charCounter) {
                        const event = new Event('input');
                        this.editor.dispatchEvent(event);
                    }
                }
            }
            this.fileInput.value = '';
        } catch (err) {
            console.log('[Upload] error', err);
            alert(err.message || 'Ошибка загрузки');
        }
    }

    async uploadFile(file) {
        const maxSize = 400 * 1024 * 1024;
        
        if (file.size > maxSize) {
            throw new Error(`Файл "${file.name}" слишком большой. Максимальный размер: 400 МБ.`);
        }

        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/upload', { method: 'POST', body: fd });
        if (!res.ok) throw new Error('Ошибка загрузки');
        return await res.json();
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    handleSubmit(event) {
        event.preventDefault();
        
        if (this.currentCooldown > 0) {
            return;
        }
        
        const messageHTML = this.editor.innerHTML.trim();
        const textContent = this.editor.innerText.trim();
        
        if (textContent.length > this.MAX_MESSAGE_LENGTH) {
            this.showMessageError(`Сообщение слишком длинное (${textContent.length}/${this.MAX_MESSAGE_LENGTH} символов)`);
            return;
        }
        
        // Проверяем, находится ли редактор в режиме редактирования
        const sendButton = document.getElementById('send-button');
        const isEditing = sendButton && sendButton.dataset.editingMessageId;
        
        if (messageHTML || this.uploadedFiles.length > 0) {
            const messageData = {
                message: messageHTML,
                files: this.uploadedFiles
            };
            
            // Если редактируем сообщение, добавляем ID
            if (isEditing) {
                messageData.edit_message_id = sendButton.dataset.editingMessageId;
            }
            
            this.socket.emit('message', messageData);
            this.editor.innerHTML = '';
            this.uploadedFiles = [];
            this.exitEditMode(); // Выходим из режима редактирования
            
            this.startCooldown();
            
            if (this.charCounter) {
                this.charCounter.textContent = `0/${this.MAX_MESSAGE_LENGTH}`;
                this.charCounter.style.color = '#8899a6';
            }
        }
    }

    showMessageError(text) {
        this.showMessage(text, 'error');
    }

    showMessageSuccess(text) {
        this.showMessage(text, 'success');
    }

    showMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? '#19cf86' : '#e0245e'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10000;
            font-weight: bold;
            max-width: 90%;
            text-align: center;
        `;
        messageDiv.textContent = text;
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            if (document.body.contains(messageDiv)) {
                document.body.removeChild(messageDiv);
            }
        }, 3000);
    }

    startCooldown() {
        if (!this.cooldownOverlay) return;
        
        this.cooldownOverlay.classList.remove('hidden');
        if (this.cooldownSeconds) {
            this.cooldownSeconds.textContent = (this.cooldownTime / 1000).toFixed(1);
        }
        
        const progress = document.querySelector('.cooldown-progress');
        if (progress) {
            progress.style.animation = 'none';
            setTimeout(() => {
                progress.style.animation = `cooldown-progress ${this.cooldownTime}ms linear`;
            }, 10);
        }
        
        this.currentCooldown = this.cooldownTime;
        if (this.cooldownTimer) clearInterval(this.cooldownTimer);
        
        this.cooldownTimer = setInterval(() => {
            this.currentCooldown -= 1000;
            if (this.currentCooldown <= 0) {
                clearInterval(this.cooldownTimer);
                this.cooldownOverlay.classList.add('hidden');
                this.spamCount = Math.max(0, this.spamCount - 1);
                this.cooldownTime = Math.max(this.cooldownTime, this.cooldownTime / 2);
            } else {
                if (this.cooldownSeconds) {
                    this.cooldownSeconds.textContent = (this.currentCooldown / 1000).toFixed(1);
                }
            }
        }, 1000);
        
        this.spamCount++;
        if (this.spamCount > 2) {
            this.cooldownTime = Math.min(this.MAX_COOLDOWN, this.cooldownTime * 2);
        }
    }

    resetViewer() {
        this.imageViewer.classList.add('hidden');
        if (this.viewerImage) {
            this.viewerImage.src = '';
        }
        this.zoomScale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.updateTransform();
        this.updateCursor();
    }
    setupContextMenu() {
        this.messageContextMenu = document.getElementById('message-context-menu');
        
        if (!this.messageContextMenu) return;

        // Обработчики для пунктов меню
        this.messageContextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                this.handleContextMenuAction(action);
            });
        });

        // Закрытие меню при клике вне
        document.addEventListener('click', (e) => {
            if (!this.messageContextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        });

        // Закрытие меню при касании вне (мобильные)
        document.addEventListener('touchstart', (e) => {
            if (!this.messageContextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        }, { passive: true });
    }

    setupMessageInteractions() {
        // Обработчики будут добавляться динамически в addMessage
    }
    

    

}

// Room search functionality
class RoomSearch {
    constructor() {
        this.searchInput = document.getElementById('room-search');
        this.resultsContainer = document.getElementById('search-results');
        this.init();
    }

    init() {
        if (this.searchInput) {
            this.searchInput.addEventListener('input', this.handleSearch.bind(this));
            this.searchInput.addEventListener('focus', this.handleFocus.bind(this));
            
            // Touch events for mobile
            this.searchInput.addEventListener('touchstart', (e) => {
                e.stopPropagation();
            }, { passive: true });
        }

        // Close results when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.searchInput?.contains(e.target) && !this.resultsContainer?.contains(e.target)) {
                this.hideResults();
            }
        });

        document.addEventListener('touchstart', (e) => {
            if (!this.searchInput?.contains(e.target) && !this.resultsContainer?.contains(e.target)) {
                this.hideResults();
            }
        }, { passive: true });
    }

    handleSearch(e) {
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            this.hideResults();
            return;
        }

        this.searchRooms(query);
    }

    handleFocus() {
        const query = this.searchInput.value.trim();
        if (query.length >= 2) {
            this.searchRooms(query);
        }
    }

    async searchRooms(query) {
        try {
            const response = await fetch(`/api/search-rooms?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            this.displayResults(data.rooms);
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    displayResults(rooms) {
        if (!this.resultsContainer) return;

        if (rooms.length === 0) {
            this.resultsContainer.innerHTML = '<div class="search-result-item">Ничего не найдено</div>';
        } else {
            this.resultsContainer.innerHTML = rooms.map(room => `
                <div class="search-result-item" data-code="${room.code}">
                    <div style="font-weight: bold;">${this.escapeHtml(room.title)}</div>
                    <div style="font-size: 0.9em; color: #8899a6;">Код: ${room.code} • Участников: ${room.members}</div>
                </div>
            `).join('');

            // Add click handlers
            this.resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.selectRoom(item.dataset.code);
                });
                
                item.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    this.selectRoom(item.dataset.code);
                }, { passive: false });
            });
        }

        this.resultsContainer.style.display = 'block';
    }

    selectRoom(roomCode) {
        const codeInput = document.getElementById('code');
        if (codeInput) {
            codeInput.value = roomCode;
        }
        this.hideResults();
        this.searchInput.value = '';
        
        // Auto-join after short delay
        setTimeout(() => {
            const joinButton = document.getElementById('join-button');
            if (joinButton) {
                joinButton.click();
            }
        }, 300);
    }

    hideResults() {
        if (this.resultsContainer) {
            this.resultsContainer.style.display = 'none';
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setupAudioPlayers() {
    document.addEventListener('click', (e) => {
        if (e.target.closest('.play-pause-btn')) {
            this.toggleAudioPlayback(e.target.closest('.audio-container'));
        }
        
        if (e.target.closest('.progress-container')) {
            this.seekAudio(e.target.closest('.audio-container'), e);
        }
    });
    
    // Инициализация всех аудио элементов
    document.querySelectorAll('.audio-preview').forEach(audio => {
        this.enhanceAudioPlayer(audio);
    });
}

enhanceAudioPlayer(audioElement) {
    const container = audioElement.closest('.message')?.querySelector('.audio-container');
    if (!container) return;
    
    const audio = audioElement;
    const playPauseBtn = container.querySelector('.play-pause-btn');
    const progressBar = container.querySelector('.progress-bar');
    const currentTimeEl = container.querySelector('.current-time');
    const durationEl = container.querySelector('.duration');
    const waves = container.querySelectorAll('.wave');
    
    // Устанавливаем длительность
    audio.addEventListener('loadedmetadata', () => {
        if (durationEl) {
            durationEl.textContent = this.formatTime(audio.duration);
        }
    });
    
    // Обновление прогресса
    audio.addEventListener('timeupdate', () => {
        if (progressBar) {
            const progress = (audio.currentTime / audio.duration) * 100;
            progressBar.style.width = `${progress}%`;
        }
        
        if (currentTimeEl) {
            currentTimeEl.textContent = this.formatTime(audio.currentTime);
        }
        
        // Анимация волн
        if (!audio.paused) {
            waves.forEach(wave => wave.style.animationPlayState = 'running');
        } else {
            waves.forEach(wave => wave.style.animationPlayState = 'paused');
        }
    });
    
    // Обновление иконки
    audio.addEventListener('play', () => {
        if (playPauseBtn) {
            playPauseBtn.innerHTML = '⏸️';
        }
    });
    
    audio.addEventListener('pause', () => {
        if (playPauseBtn) {
            playPauseBtn.innerHTML = '▶️';
        }
    });
}

toggleAudioPlayback(container) {
    const audio = container.querySelector('.audio-preview');
    if (!audio) return;
    
    if (audio.paused) {
        audio.play();
    } else {
        audio.pause();
    }
}

seekAudio(container, event) {
    const audio = container.querySelector('.audio-preview');
    const progressContainer = container.querySelector('.progress-container');
    if (!audio || !progressContainer) return;
    
    const rect = progressContainer.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audio.duration;
}

formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}


createImagePreview(file) {
    const aspectClass = this.getAspectRatioClass(file);
    return `
        <div class="image-container ${aspectClass}" data-original-src="${file.url}">
            <img src="${file.url}" alt="Изображение" 
                 class="media-preview image-preview optimized-image" 
                 loading="lazy"
                 data-width="${file.width || ''}"
                 data-height="${file.height || ''}"
                 onload="this.parentElement.classList.add('image-loaded')">
        </div>
    `;
}

    getAspectRatioClass(file) {
        // Если в файле есть информация о размерах, используем ее
        if (file.width && file.height) {
            const ratio = file.width / file.height;
            
            if (Math.abs(ratio - 16/9) < 0.1) return '16-9';
            if (Math.abs(ratio - 4/3) < 0.1) return '4-3';
            if (Math.abs(ratio - 1/1) < 0.1) return '1-1';
            if (Math.abs(ratio - 9/16) < 0.1) return '9-16';
            
            // Определяем портретное или альбомное
            return ratio > 1 ? 'landscape' : 'portrait';
        }
        
        // Если информации о размерах нет, возвращаем общий класс
        return 'auto';
    }

    // Обновляем функцию загрузки файлов для получения размеров изображений
    async uploadFile(file) {
        const maxSize = 400 * 1024 * 1024;
        
        if (file.size > maxSize) {
            throw new Error(`Файл "${file.name}" слишком большой. Максимальный размер: 400 МБ.`);
        }

        // Для изображений получаем размеры
        if (file.type.startsWith('image/')) {
            try {
                const dimensions = await this.getImageDimensions(file);
                const fd = new FormData();
                fd.append('file', file);
                
                const res = await fetch('/upload', { method: 'POST', body: fd });
                if (!res.ok) throw new Error('Ошибка загрузки');
                
                const result = await res.json();
                // Добавляем размеры в метаданные
                result.width = dimensions.width;
                result.height = dimensions.height;
                
                return result;
            } catch (error) {
                console.error('Error getting image dimensions:', error);
                // Если не удалось получить размеры, загружаем без них
                const fd = new FormData();
                fd.append('file', file);
                const res = await fetch('/upload', { method: 'POST', body: fd });
                if (!res.ok) throw new Error('Ошибка загрузки');
                return await res.json();
            }
        } else {
            // Для не-изображений загружаем как обычно
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/upload', { method: 'POST', body: fd });
            if (!res.ok) throw new Error('Ошибка загрузки');
            return await res.json();
        }
    }

    getImageDimensions(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            
            img.onload = function() {
                resolve({
                    width: this.width,
                    height: this.height
                });
                URL.revokeObjectURL(url);
            };
            
            img.onerror = function() {
                reject(new Error('Не удалось загрузить изображение для определения размеров'));
                URL.revokeObjectURL(url);
            };
            
            img.src = url;
        });
    }

    // Обновляем функцию вставки изображений в редактор
    async handleFileUpload(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        
        const maxSize = 400 * 1024 * 1024;
        
        for (const file of files) {
            if (file.size > maxSize) {
                alert(`Файл "${file.name}" слишком большой. Максимальный размер: 400 МБ.`);
                this.fileInput.value = '';
                return;
            }
        }
        
        const totalSize = files.reduce((acc, file) => acc + file.size, 0);
        if (totalSize > maxSize) {
            alert(`Общий размер файлов превышает 400 МБ. Выберите меньше файлов.`);
            this.fileInput.value = '';
            return;
        }
        
        try {
            for (const file of files) {
                const meta = await this.uploadFile(file);
                this.uploadedFiles.push(meta);
                
                let insertHtml = '';
                const sizeInfo = `<div class="file-size">${this.formatFileSize(file.size)}</div>`;
                
                if (meta.kind === 'image') {
                    // Для изображений используем уменьшенные превью
                    insertHtml = `
                        <div class="image-container editor-preview" data-aspect-ratio="${this.getAspectRatioClass(meta)}">
                            <img src="${meta.url}" alt="${meta.name}" 
                                 class="media-preview image-preview" 
                                 loading="lazy"
                                 style="max-width: 150px; max-height: 100px;">
                            ${sizeInfo}
                        </div>
                    `;
                } else if (meta.kind === 'video') {
                    insertHtml = `
                        <div class="video-container" style="position:relative; max-width:100%; margin:10px 0;">
                            <video 
                                src="${meta.url}" 
                                controls 
                                preload="metadata"
                                controlsList="nodownload"
                                class="media-preview video-preview"
                                playsinline
                                style="max-width: 250px; max-height: 150px;"
                            >
                                Ваш браузер не поддерживает видео.
                            </video>
                            ${sizeInfo}
                        </div>
                    `;
                } else if (meta.kind === 'audio') {
                    insertHtml = `<div><audio src="${meta.url}" controls preload="metadata" class="media-preview audio-preview" style="max-width: 250px;"></audio>${sizeInfo}</div>`;
                } else if (meta.kind === 'file') {
                    insertHtml = `<div><a href="${meta.url}" download="${meta.name}" class="file-preview">📎 ${meta.name}</a>${sizeInfo}</div>`;
                }
                
                if (insertHtml && this.editor) {
                    this.editor.focus();
                    document.execCommand('insertHTML', false, insertHtml + ' ');
                    if (this.charCounter) {
                        const event = new Event('input');
                        this.editor.dispatchEvent(event);
                    }
                }
            }
            this.fileInput.value = '';
        } catch (err) {
            console.log('[Upload] error', err);
            alert(err.message || 'Ошибка загрузки');
        }
    }



}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize room chat if on room page
    const messagesJsonElement = document.getElementById('room-messages-data');
    const roomData = document.getElementById('room-data');
    
    if (messagesJsonElement && roomData) {
        let initialMessages = [];
        let defaultAvatar = '';
        let userId = '';
        let userName = '';
        let userAvatar = '';
        
        try {
            const messagesJson = messagesJsonElement.textContent.trim();
            if (messagesJson) {
                initialMessages = JSON.parse(messagesJson);
            }
        } catch (e) {
            console.error('Error parsing messages JSON:', e);
        }
        
        if (roomData) {
            defaultAvatar = roomData.dataset.defaultAvatar || '';
            userId = roomData.dataset.userId || '';
            userName = roomData.dataset.userName || '';
            userAvatar = roomData.dataset.userAvatar || '';
        }
        
        const config = {
            initialMessages: initialMessages,
            defaultAvatar: defaultAvatar,
            userId: userId,
            userName: userName,
            userAvatar: userAvatar
        };
        
        try {
            window.roomChat = new RoomChat(config);
        } catch (error) {
            console.error('Error initializing RoomChat:', error);
        }
    }

    // Initialize room search if on home page
    if (document.getElementById('room-search')) {
        window.roomSearch = new RoomSearch();
    }

    // Add touch-friendly improvements to all interactive elements
    document.querySelectorAll('button, .clickable, [onclick]').forEach(element => {
        element.style.cursor = 'pointer';
        element.addEventListener('touchstart', function() {
            this.style.transform = 'scale(0.98)';
        }, { passive: true });
        
        element.addEventListener('touchend', function() {
            this.style.transform = 'scale(1)';
        }, { passive: true });
    });

    // Improve form inputs for mobile
    document.querySelectorAll('input, textarea, select').forEach(element => {
        element.addEventListener('focus', function() {
            this.style.transform = 'scale(1.02)';
        });
        
        element.addEventListener('blur', function() {
            this.style.transform = 'scale(1)';
        });
    });

    // Prevent zoom on double tap for interactive elements
    document.addEventListener('dblclick', function(e) {
        if (e.target.matches('button, .clickable, [onclick], input, textarea, select')) {
            e.preventDefault();
        }
    });

    // Handle orientation changes
    window.addEventListener('orientationchange', function() {
        // Refresh any layout-dependent elements
        setTimeout(() => {
            if (window.roomChat) {
                window.roomChat.setupWindowResize();
            }
        }, 300);
    });
});
