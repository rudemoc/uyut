// static/home.js
function joinPublic(code) {
    const codeInput = document.getElementById('code');
    codeInput.value = code;
    document.getElementById('join-button').click();
}

function renderPublicRooms(rooms) {
    const container = document.getElementById('public-rooms');
    if (!rooms.length) {
        container.innerHTML = '<em>No public rooms yet. Be the first to create one.</em>';
        return;
    }
    container.innerHTML = '';
    rooms.forEach(r => {
        const item = document.createElement('div');
        item.className = 'room-item';
        item.innerHTML = `
            <div class="room-title"><strong>${r.title}</strong></div>
            <div class="room-meta"><span>Code: ${r.code}</span> · <span>${r.members} online</span></div>
            <button type="button" class="join-public" data-code="${r.code}">Join</button>
        `;
        item.querySelector('button.join-public').addEventListener('click', () => joinPublic(r.code));
        container.appendChild(item);
    });
}

async function fetchPublicRooms() {
    try {
        const res = await fetch('/api/public-rooms');
        const data = await res.json();
        renderPublicRooms(data.rooms || []);
    } catch (e) {
        console.log('[PublicRooms] fetch error', e);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    fetchPublicRooms();
    setInterval(fetchPublicRooms, 5000);
});