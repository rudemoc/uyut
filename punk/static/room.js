// static/room.js - Enhanced with YouTube-like video player and message length limit
class RoomChat {
    constructor(config) {
        console.log('RoomChat initializing with config:', config);
        
        this.socket = io();
        
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
        this.resizerTop = document.querySelector('.resizer-top');
        this.sendButton = document.getElementById('send-button');
        this.sendContainer = document.getElementById('send-container');
        this.cooldownOverlay = document.getElementById('cooldown-overlay');
        this.cooldownSeconds = document.getElementById('cooldown-seconds');
        this.charCounter = document.getElementById('char-counter');
        
        console.log('DOM elements loaded:', {
            messagesDiv: !!this.messagesDiv,
            editor: !!this.editor,
            sendContainer: !!this.sendContainer,
            charCounter: !!this.charCounter
        });

        this.initialMessages = Array.isArray(config.initialMessages) ? config.initialMessages : [];
        this.defaultAvatar = config.defaultAvatar || '';
        this.userId = config.userId || '';
        this.userName = config.userName || '';
        this.userAvatar = config.userAvatar || '';
        
        console.log('Initial messages count:', this.initialMessages.length);
        3000
        this.cooldownTime = 1000;
        this.currentCooldown = 0;
        this.cooldownTimer = null;
        this.spamCount = 0;
        this.MAX_COOLDOWN = 30000;

        this.isResizing = false;
        this.startY = 0;
        this.startHeight = 0;
        this.MIN_EDITOR_HEIGHT = 40;
        this.MAX_EDITOR_HEIGHT = window.innerHeight * 0.8;

        this.zoomScale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.ZOOM_STEP = 0.2;
        this.MAX_ZOOM = 5;
        this.MIN_ZOOM = 0.5;

        this.maxTranslateX = 0;
        this.maxTranslateY = 0;
        this.minTranslateX = 0;
        this.minTranslateY = 0;

        this.isAtBottom = true;

        this.MAX_MESSAGE_LENGTH = 512;

        this.init();
    }

    init() {
        console.log('Initializing RoomChat...');
        this.setupEventListeners();
        this.loadInitialMessages();
        this.setupSocketEvents();
        this.setupEmojiPicker();
        this.setupResizer();
        this.setupImageViewerControls();
        this.setupWindowResize();
        this.setupScrollTracking();
        this.setupCharCounter();
        console.log('RoomChat initialized successfully');
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
        
        // Initial update
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
            this.MAX_EDITOR_HEIGHT = window.innerHeight * 0.8;
            
            const currentHeight = this.editor.offsetHeight;
            if (currentHeight > this.MAX_EDITOR_HEIGHT) {
                this.editor.style.height = `${this.MAX_EDITOR_HEIGHT}px`;
            }
        });
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        if (this.boldBtn) {
            this.boldBtn.addEventListener('click', () => this.formatText('bold'));
        }
        if (this.italicBtn) {
            this.italicBtn.addEventListener('click', () => this.formatText('italic'));
        }
        if (this.sizeSelect) {
            this.sizeSelect.addEventListener('change', (e) => this.changeFontSize(e.target.value));
        }
        if (this.emojiBtn) {
            this.emojiBtn.addEventListener('click', () => this.toggleEmojiPicker());
        }
        if (this.closeEmojiPicker) {
            this.closeEmojiPicker.addEventListener('click', () => this.hideEmojiPicker());
        }
        
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }
        
        if (this.sendContainer) {
            this.sendContainer.addEventListener('submit', (e) => this.handleSubmit(e));
        }
        
        if (this.closeViewerButton) {
            this.closeViewerButton.addEventListener('click', () => this.resetViewer());
        }
        if (this.imageViewer) {
            this.imageViewer.addEventListener('click', (e) => {
                if (e.target === this.imageViewer) this.resetViewer();
            });
        }
        
        document.addEventListener('click', (e) => {
            if (this.emojiBtn && this.emojiPicker) {
                if (!this.emojiBtn.contains(e.target) && !this.emojiPicker.contains(e.target)) {
                    this.hideEmojiPicker();
                }
            }
        });
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

        this.socket.on('disconnect', () => {
            console.log('[Debug] WebSocket disconnected');
        });

        this.socket.on('error', (error) => {
            console.error('[Debug] WebSocket error:', error);
        });
    }

    setupEmojiPicker() {
        if (!this.emojiPicker) return;
        
        this.emojiPicker.querySelectorAll('.emoji').forEach(emoji => {
            emoji.addEventListener('click', () => {
                if (this.editor) {
                    this.editor.focus();
                    document.execCommand('insertText', false, emoji.textContent);
                    // Update character counter
                    if (this.charCounter) {
                        const event = new Event('input');
                        this.editor.dispatchEvent(event);
                    }
                }
            });
        });
    }

    setupResizer() {
        if (!this.resizerTop) return;
        
        this.resizerTop.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            this.startY = e.clientY;
            this.startHeight = this.editor.offsetHeight;
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isResizing) return;
            const delta = this.startY - e.clientY;
            const newHeight = this.startHeight + delta;
            
            this.editor.style.height = `${Math.max(this.MIN_EDITOR_HEIGHT, Math.min(this.MAX_EDITOR_HEIGHT, newHeight))}px`;
            
            this.scrollToBottom();
        });

        window.addEventListener('mouseup', () => {
            this.isResizing = false;
        });

        this.resizerTop.addEventListener('dblclick', () => {
            this.editor.style.height = `${this.MIN_EDITOR_HEIGHT}px`;
        });
    }

    setupImageViewerControls() {
        if (!this.imageViewer) return;
        
        this.imageViewer.addEventListener('wheel', (e) => {
            if (!this.viewerImage.src) return;
            e.preventDefault();

            const rect = this.viewerImage.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const oldScale = this.zoomScale;
            
            if (e.deltaY < 0) {
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

        }, { passive: false });

        this.viewerImage.addEventListener('mousedown', (e) => {
            if (!this.viewerImage.src) return;
            
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.viewerImage.style.cursor = 'grabbing';
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;
            
            this.translateX += deltaX;
            this.translateY += deltaY;
            
            this.constrainTranslation();
            this.updateTransform();
            
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        window.addEventListener('mouseup', (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                this.updateCursor();
            }
        });

        this.viewerImage.addEventListener('dblclick', (e) => {
            this.zoomScale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.updateTransform();
            this.updateCursor();
        });

        window.addEventListener('resize', () => {
            this.calculateBounds();
            this.constrainTranslation();
            this.updateTransform();
        });
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

    loadInitialMessages() {
        console.log('Loading initial messages:', this.initialMessages);
        
        this.initialMessages.forEach(msg => this.addMessage(msg, false));
        
        setTimeout(() => {
            this.scrollToBottom();
        }, 100);
        
        setTimeout(() => {
            this.scrollToBottom();
        }, 500);
    }




    openUserProfile(userId) {
    window.open(`/user/${userId}`, '_blank');
}

// Метод для быстрого начала чата
startQuickChat(userId) {
    window.location.href = `/quick_chat/${userId}`;
}





    addMessage(msg, smoothScroll = true) {
    if (!msg || (!msg.sender && msg.sender !== '' && msg.sender !== 'System') || (!msg.message && !msg.file)) {
        console.log('[Debug] Skipping invalid message:', msg);
        return;
    }

    console.log('[Debug] Adding message:', msg);

    const wasAtBottom = this.isAtBottom;

    const msgElem = document.createElement('div');
    msgElem.classList.add('message');

    const avatar = msg.avatar ? `data:image/png;base64,${msg.avatar}` : `data:image/png;base64,${this.defaultAvatar}`;

    const left = document.createElement('div');
    left.className = 'avatar-container';
    left.style.position = 'relative';
    
    const avatarImg = document.createElement('img');
    avatarImg.className = 'avatar clickable-avatar';
    avatarImg.src = avatar;
    
    // Добавляем обработчик клика на аватарку
    if (msg.user_id && msg.user_id !== this.userId) {
        avatarImg.style.cursor = 'pointer';
        
        // Левый клик - профиль
        avatarImg.addEventListener('click', (e) => {
            this.openUserProfile(msg.user_id);
        });
        
        // Правый клик - контекстное меню
        avatarImg.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showAvatarContextMenu(e, msg.user_id, msg.sender);
        });
        
        // Добавляем подсказку
        const hint = document.createElement('div');
        hint.className = 'avatar-hint';
        hint.textContent = 'Левый клик - профиль • Правый клик - меню';
        left.appendChild(hint);
    }

    left.appendChild(avatarImg);
    
    const payload = document.createElement('div');
    payload.className = 'payload';

    if (msg.sender === 'System') {
        payload.innerHTML = `<em>${msg.message || ''}</em>`;
    } else {
        const sanitizedSender = msg.sender ? msg.sender.replace(/[^A-Za-z0-9_]/g, '') : 'user';
        const header = `<strong style="color: #d9d9d9;">${msg.sender}</strong> <span style="color: #8899a6;">@${sanitizedSender}</span><br>`;
        
        let messageContent = msg.message ? msg.message : '';
        
        if (messageContent.includes('<video')) {
            messageContent = this.enhanceVideoElements(messageContent);
        }
        
        payload.innerHTML = header + messageContent;
    }

    msgElem.appendChild(left);
    msgElem.appendChild(payload);
    this.messagesDiv.appendChild(msgElem);

    this.attachImageClickHandlers(payload);
    this.enhanceExistingVideos(payload);

    if (wasAtBottom && smoothScroll) {
        setTimeout(() => {
            this.scrollToBottom();
        }, 50);
    }
}

showAvatarContextMenu(event, userId, userName) {
    // Удаляем существующее контекстное меню
    const existingMenu = document.getElementById('avatar-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
    
    const menu = document.createElement('div');
    menu.id = 'avatar-context-menu';
    menu.style.cssText = `
        position: fixed;
        top: ${event.clientY}px;
        left: ${event.clientX}px;
        background: #253341;
        border: 1px solid #38444d;
        border-radius: 8px;
        padding: 8px 0;
        z-index: 1000;
        min-width: 180px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    `;
    
    const profileOption = document.createElement('div');
    profileOption.textContent = `👤 Профиль ${userName}`;
    profileOption.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        color: #d9d9d9;
        border-bottom: 1px solid #38444d;
    `;
    profileOption.addEventListener('mouseenter', () => {
        profileOption.style.background = '#38444d';
    });
    profileOption.addEventListener('mouseleave', () => {
        profileOption.style.background = 'transparent';
    });
    profileOption.addEventListener('click', () => {
        this.openUserProfile(userId);
        menu.remove();
    });
    
    const chatOption = document.createElement('div');
    chatOption.textContent = '💬 Личное сообщение';
    chatOption.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        color: #d9d9d9;
    `;
    chatOption.addEventListener('mouseenter', () => {
        chatOption.style.background = '#38444d';
    });
    chatOption.addEventListener('mouseleave', () => {
        chatOption.style.background = 'transparent';
    });
    chatOption.addEventListener('click', () => {
        this.startDirectMessage(userId);
        menu.remove();
    });
    
    menu.appendChild(profileOption);
    menu.appendChild(chatOption);
    
    document.body.appendChild(menu);
    
    // Закрытие меню при клике вне его
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 100);
}



    openUserProfile(userId) {
    window.open(`/user/${userId}`, '_blank');
}
startDirectMessage(userId) {
    window.location.href = `/direct_message/${userId}`;
}

    enhanceVideoElements(htmlContent) {
        // Add streaming-friendly attributes to video elements
        return htmlContent.replace(
            /<video([^>]*)>/g, 
            '<video$1 preload="metadata" controlsList="nodownload" style="max-width:100%; height:auto; border-radius:12px; background:#000;">'
        );
    }

    

    enhanceExistingVideos(container) {
        // Enhance all video elements in the container
        container.querySelectorAll('video').forEach(video => {
            video.setAttribute('preload', 'metadata');
            video.setAttribute('controlsList', 'nodownload');
            video.style.maxWidth = '100%';
            video.style.height = 'auto';
            video.style.borderRadius = '12px';
            video.style.background = '#000';
            
            // Add loading indicator
            video.addEventListener('waiting', () => {
                video.style.opacity = '0.7';
            });
            
            video.addEventListener('canplay', () => {
                video.style.opacity = '1';
            });
            
            // Add error handling
            video.addEventListener('error', (e) => {
                console.error('Video error:', e);
                video.style.opacity = '0.5';
            });
        });
    }

    attachImageClickHandlers(container) {
        container.querySelectorAll('img.inline-image').forEach(img => {
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
                alert(`File "${file.name}" is too large. Maximum file size is 400 MB.`);
                this.fileInput.value = '';
                return;
            }
        }
        
        const totalSize = files.reduce((acc, file) => acc + file.size, 0);
        if (totalSize > maxSize) {
            alert(`Total files size exceeds 400 MB. Please select fewer files.`);
            this.fileInput.value = '';
            return;
        }
        
        try {
            const metas = await Promise.all(files.map(file => this.uploadFile(file)));
            metas.forEach((meta, index) => {
                const file = files[index];
                let insertHtml = '';
                const sizeInfo = `<div class="file-size">${this.formatFileSize(file.size)}</div>`;
                
                if (meta.kind === 'image') {
                    insertHtml = `<div><img src="${meta.url}" alt="${meta.name}" class="inline-image" style="max-width:100%; height:auto; border-radius:12px;">${sizeInfo}</div>`;
                } else if (meta.kind === 'video') {
                    // Enhanced video player with streaming support
                    insertHtml = `
                        <div class="video-container" style="position:relative; max-width:100%; margin:10px 0;">
                            <video 
                                src="${meta.url}" 
                                controls 
                                preload="metadata"
                                controlsList="nodownload"
                                style="max-width:100%; height:auto; border-radius:12px; background:#000;"
                                onloadstart="this.style.opacity='0.7'" 
                                oncanplay="this.style.opacity='1'"
                            >
                                Your browser does not support the video tag.
                            </video>
                            ${sizeInfo}
                        </div>
                    `;
                } else if (meta.kind === 'audio') {
                    insertHtml = `<div><audio src="${meta.url}" controls preload="metadata" style="width:100%; margin:10px 0;"></audio>${sizeInfo}</div>`;
                } else if (meta.kind === 'file') {
                    insertHtml = `<div><a href="${meta.url}" download="${meta.name}" style="color: #19cf86; text-decoration:none; padding:8px 12px; background:#253341; border-radius:8px; display:inline-block; margin:5px 0;">📎 ${meta.name}</a>${sizeInfo}</div>`;
                }
                if (insertHtml && this.editor) {
                    this.editor.focus();
                    document.execCommand('insertHTML', false, insertHtml + ' ');
                    // Update character counter
                    if (this.charCounter) {
                        const event = new Event('input');
                        this.editor.dispatchEvent(event);
                    }
                }
            });
            this.fileInput.value = '';
        } catch (err) {
            console.log('[Upload] error', err);
            alert(err.message || 'Upload failed');
        }
    }

    async uploadFile(file) {
        const maxSize = 400 * 1024 * 1024;
        
        if (file.size > maxSize) {
            throw new Error(`File "${file.name}" is too large. Maximum file size is 400 MB.`);
        }

        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/upload', { method: 'POST', body: fd });
        if (!res.ok) throw new Error('Upload failed');
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
        
        // Проверка длины сообщения
        if (textContent.length > this.MAX_MESSAGE_LENGTH) {
            this.showMessageError(`Сообщение слишком длинное (${textContent.length}/${this.MAX_MESSAGE_LENGTH} символов)`);
            return;
        }
        
        if (messageHTML) {
            this.socket.emit('message', { message: messageHTML });
            this.editor.innerHTML = '';
            this.startCooldown();
            
            // Сброс счетчика символов
            if (this.charCounter) {
                this.charCounter.textContent = `0/${this.MAX_MESSAGE_LENGTH}`;
                this.charCounter.style.color = '#8899a6';
            }
        }
    }

    showMessageError(text) {
        // Временное уведомление об ошибке
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #e0245e;
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 10000;
            font-weight: bold;
        `;
        errorDiv.textContent = text;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (document.body.contains(errorDiv)) {
                document.body.removeChild(errorDiv);
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

    updateTransform() {
        if (this.viewerImage) {
            this.viewerImage.style.transform =
                `translate(${this.translateX}px, ${this.translateY}px) scale(${this.zoomScale})`;
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
}

document.addEventListener('DOMContentLoaded', function() {
    const messagesJsonElement = document.getElementById('room-messages-data');
    const roomData = document.getElementById('room-data');
    
    let initialMessages = [];
    let defaultAvatar = '';
    let userId = '';
    let userName = '';
    let userAvatar = '';
    
    if (messagesJsonElement) {
        try {
            const messagesJson = messagesJsonElement.textContent.trim();
            console.log('Raw messages JSON from script tag:', messagesJson);
            
            if (messagesJson) {
                initialMessages = JSON.parse(messagesJson);
            } else {
                initialMessages = [];
            }
        } catch (e) {
            console.error('Error parsing messages JSON from script tag:', e);
            console.error('Problematic JSON:', messagesJsonElement.textContent);
            initialMessages = [];
        }
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
    
    console.log('Final config:', config);
    
    try {
        window.roomChat = new RoomChat(config);
    } catch (error) {
        console.error('Error initializing RoomChat:', error);
    }
});