(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const scoreElement = document.querySelector('#score');
  const highScoreElement = document.querySelector('#high-score');
  const waveElement = document.querySelector('#wave');
  const livesElement = document.querySelector('#lives');
  const lasersElement = document.querySelector('#lasers');
  const overlay = document.querySelector('#overlay');
  const overlayKicker = document.querySelector('#overlay-kicker');
  const overlayTitle = document.querySelector('#overlay-title');
  const overlayCopy = document.querySelector('#overlay-copy');
  const startButton = document.querySelector('#start-button');
  const soundButton = document.querySelector('#sound-toggle');
  const W = canvas.width;
  const H = canvas.height;

  const keys = new Set();
  const state = {
    mode: 'ready',
    score: 0,
    best: loadBest(),
    wave: 0,
    lives: 3,
    lasers: 3,
    player: { x: W / 2, y: H - 62, speed: 370, cooldown: 0, invulnerable: 0 },
    enemies: [],
    shots: [],
    enemyShots: [],
    particles: [],
    stars: Array.from({ length: 95 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: Math.random() * 1.7 + .25,
      speed: Math.random() * 20 + 8,
      alpha: Math.random() * .6 + .2
    })),
    formation: { x: 0, direction: 1, speed: 34, drop: 0 },
    fireTimer: 0,
    laserFlash: 0,
    soundOn: false,
    audioContext: null
  };

  function loadBest() {
    try { return Number(localStorage.getItem('round42-best')) || 0; }
    catch { return 0; }
  }

  function saveBest() {
    try { localStorage.setItem('round42-best', String(state.best)); }
    catch { /* Storage is optional. */ }
  }

  function playTone(frequency, duration, volume = .025) {
    if (!state.soundOn || !state.audioContext) return;
    const oscillator = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, state.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, state.audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(state.audioContext.destination);
    oscillator.start();
    oscillator.stop(state.audioContext.currentTime + duration);
  }

  function formatScore(value) {
    return String(value).padStart(6, '0');
  }

  function updateHud() {
    scoreElement.textContent = formatScore(state.score);
    highScoreElement.textContent = formatScore(state.best);
    waveElement.textContent = state.wave ? `${String(state.wave).padStart(2, '0')} / 42` : '— / 42';
    livesElement.textContent = `${'◆ '.repeat(state.lives).trim() || '—'}`;
    lasersElement.textContent = `${'● '.repeat(state.lasers).trim() || '—'}`;
  }

  function makeWave(wave) {
    state.wave = wave;
    state.formation = { x: 0, direction: 1, speed: 30 + wave * 2.2, drop: 0 };
    const columns = Math.min(7 + Math.floor(wave / 3), 11);
    const rows = Math.min(2 + Math.floor((wave - 1) / 5), 4);
    const gapX = Math.min(75, 710 / columns);
    const gapY = 48;
    const left = (W - (columns - 1) * gapX) / 2;
    state.enemies = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        state.enemies.push({
          x: left + col * gapX,
          y: 80 + row * gapY,
          homeX: left + col * gapX,
          homeY: 80 + row * gapY,
          phase: Math.random() * Math.PI * 2,
          type: (row + wave) % 3,
          hp: wave > 12 && row === 0 ? 2 : 1,
          sway: 9 + Math.random() * 11
        });
      }
    }
    state.fireTimer = Math.max(.45, 1.45 - wave * .018);
    updateHud();
  }

  function begin() {
    const newGame = state.mode === 'ready' || state.mode === 'gameover' || state.mode === 'won';
    state.mode = 'playing';
    if (newGame || state.wave === 0) {
      state.score = 0;
      state.lives = 3;
      state.lasers = 3;
      state.player.x = W / 2;
      state.player.invulnerable = 0;
      state.shots = [];
      state.enemyShots = [];
      makeWave(1);
    } else if (state.enemies.length === 0) {
      makeWave(state.wave + 1);
    }
    overlay.classList.add('hidden');
    updateHud();
  }

  function showOverlay(mode) {
    state.mode = mode;
    overlay.classList.remove('hidden');
    if (mode === 'paused') {
      overlayKicker.textContent = 'MISSIONE IN PAUSA';
      overlayTitle.textContent = 'PRENDI FIATO, PILOTA';
      overlayCopy.textContent = 'La galassia aspetta. Riprendi quando sei pronto.';
      startButton.innerHTML = 'RIPRENDI LA MISSIONE <span>→</span>';
    } else if (mode === 'gameover') {
      overlayKicker.textContent = 'SEGNALE PERSO';
      overlayTitle.textContent = 'MISSIONE FALLITA';
      overlayCopy.textContent = `Hai raggiunto l’ondata ${state.wave}. Punteggio: ${formatScore(state.score)}.`;
      startButton.innerHTML = 'RIPROVA <span>→</span>';
    } else if (mode === 'won') {
      overlayKicker.textContent = 'SETTORE 42 LIBERATO';
      overlayTitle.textContent = 'GALASSIA SALVA!';
      overlayCopy.textContent = `Hai superato tutte le ondate. Punteggio finale: ${formatScore(state.score)}.`;
      startButton.innerHTML = 'GIOCA ANCORA <span>→</span>';
    } else {
      overlayKicker.textContent = 'TRASMISSIONE IN ARRIVO';
      overlayTitle.textContent = 'PRONTO, PILOTA?';
      overlayCopy.textContent = 'Le formazioni aliene si avvicinano. Resisti a tutte le 42 ondate.';
      startButton.innerHTML = 'INIZIA LA MISSIONE <span>→</span>';
    }
  }

  function togglePause() {
    if (state.mode === 'playing') showOverlay('paused');
    else if (state.mode === 'paused') begin();
  }

  function fire() {
    if (state.mode !== 'playing' || state.player.cooldown > 0) return;
    state.shots.push({ x: state.player.x, y: state.player.y - 20, speed: 520 });
    state.player.cooldown = .19;
    playTone(680, .055);
  }

  function useLaser() {
    if (state.mode !== 'playing' || state.lasers < 1) return;
    state.lasers -= 1;
    state.laserFlash = .3;
    playTone(180, .28, .04);
    const targets = state.enemies.filter(enemy => Math.abs(enemy.x - state.player.x) < 47);
    if (targets.length) {
      for (const enemy of targets) destroyEnemy(enemy, 150);
      state.enemies = state.enemies.filter(enemy => !targets.includes(enemy));
    }
    updateHud();
  }

  function destroyEnemy(enemy, points = 100) {
    state.score += points;
    playTone(280 + enemy.type * 100, .1);
    if (state.score > state.best) {
      state.best = state.score;
      saveBest();
    }
    for (let i = 0; i < 9; i += 1) {
      state.particles.push({
        x: enemy.x, y: enemy.y,
        vx: (Math.random() - .5) * 150,
        vy: (Math.random() - .5) * 150,
        life: .35 + Math.random() * .35,
        color: ['#c7ff5e', '#fc5b9b', '#64d8ff'][enemy.type]
      });
    }
  }

  function hitPlayer() {
    if (state.player.invulnerable > 0) return;
    state.lives -= 1;
    playTone(110, .35, .05);
    state.player.invulnerable = 1.6;
    state.player.x = W / 2;
    state.enemyShots = [];
    updateHud();
    if (state.lives <= 0) showOverlay('gameover');
  }

  function update(dt) {
    for (const star of state.stars) {
      star.y += star.speed * dt;
      if (star.y > H) { star.y = 0; star.x = Math.random() * W; }
    }
    if (state.mode !== 'playing') return;

    state.player.cooldown = Math.max(0, state.player.cooldown - dt);
    state.player.invulnerable = Math.max(0, state.player.invulnerable - dt);
    state.laserFlash = Math.max(0, state.laserFlash - dt);
    if (keys.has('ArrowLeft') || keys.has('a')) state.player.x -= state.player.speed * dt;
    if (keys.has('ArrowRight') || keys.has('d')) state.player.x += state.player.speed * dt;
    state.player.x = Math.max(28, Math.min(W - 28, state.player.x));
    if (keys.has(' ')) fire();

    const formation = state.formation;
    formation.x += formation.direction * formation.speed * dt;
    if (formation.x > 90 || formation.x < -90) {
      formation.direction *= -1;
      formation.drop += 8 + Math.min(state.wave, 12);
    }
    for (const enemy of state.enemies) {
      enemy.x = enemy.homeX + formation.x + Math.sin(performance.now() / 750 + enemy.phase) * enemy.sway;
      enemy.y = enemy.homeY + formation.drop + Math.sin(performance.now() / 950 + enemy.phase) * 6;
      if (enemy.y > H - 110) hitPlayer();
    }
    if (state.mode !== 'playing') return;

    state.fireTimer -= dt;
    if (state.fireTimer <= 0 && state.enemies.length) {
      const shooter = state.enemies[Math.floor(Math.random() * state.enemies.length)];
      state.enemyShots.push({ x: shooter.x, y: shooter.y + 13, speed: 155 + state.wave * 3 });
      state.fireTimer = Math.max(.35, 1.35 - state.wave * .02) * (.65 + Math.random() * .7);
    }

    for (const shot of state.shots) shot.y -= shot.speed * dt;
    for (const shot of state.enemyShots) shot.y += shot.speed * dt;
    state.shots = state.shots.filter(shot => shot.y > -10);
    state.enemyShots = state.enemyShots.filter(shot => {
      if (shot.y > H + 10) return false;
      if (Math.abs(shot.x - state.player.x) < 16 && Math.abs(shot.y - state.player.y) < 18) {
        hitPlayer();
        return false;
      }
      return true;
    });
    if (state.mode !== 'playing') return;

    for (const shot of state.shots) {
      const enemy = state.enemies.find(target => Math.abs(target.x - shot.x) < 18 && Math.abs(target.y - shot.y) < 16);
      if (enemy) {
        shot.y = -20;
        enemy.hp -= 1;
        if (enemy.hp <= 0) {
          destroyEnemy(enemy);
          state.enemies = state.enemies.filter(target => target !== enemy);
        }
      }
    }

    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
    }
    state.particles = state.particles.filter(particle => particle.life > 0);
    updateHud();
    if (!state.enemies.length && state.mode === 'playing') {
      if (state.wave === 42) showOverlay('won');
      else {
        state.lasers += 1;
        makeWave(state.wave + 1);
      }
    }
  }

  function drawShip() {
    const { x, y } = state.player;
    if (state.player.invulnerable > 0 && Math.floor(performance.now() / 90) % 2) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = '#c7ff5e';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#d6ff8e';
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(15, 13);
    ctx.lineTo(5, 9);
    ctx.lineTo(0, 14);
    ctx.lineTo(-5, 9);
    ctx.lineTo(-15, 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fc5b9b';
    ctx.fillRect(-2, 10, 4, 8 + Math.random() * 6);
    ctx.restore();
  }

  function drawEnemy(enemy) {
    const colors = ['#fc5b9b', '#64d8ff', '#c7ff5e'];
    const color = colors[enemy.type];
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.shadowColor = color;
    ctx.shadowBlur = 13;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-14, -7);
    ctx.lineTo(-8, -12);
    ctx.lineTo(-3, -8);
    ctx.lineTo(3, -8);
    ctx.lineTo(8, -12);
    ctx.lineTo(14, -7);
    ctx.lineTo(11, 2);
    ctx.lineTo(6, 8);
    ctx.lineTo(3, 5);
    ctx.lineTo(-3, 5);
    ctx.lineTo(-6, 8);
    ctx.lineTo(-11, 2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#101629';
    ctx.fillRect(-7, -4, 3, 3);
    ctx.fillRect(4, -4, 3, 3);
    if (enemy.hp > 1) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(-16, -14, 32, 27);
    }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#090e20');
    bg.addColorStop(1, '#080d1a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    for (const star of state.stars) {
      ctx.globalAlpha = star.alpha;
      ctx.fillStyle = '#d8e3ff';
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;

    if (state.laserFlash > 0) {
      ctx.globalAlpha = Math.min(1, state.laserFlash * 4);
      const beam = ctx.createLinearGradient(state.player.x - 12, 0, state.player.x + 12, 0);
      beam.addColorStop(0, '#c7ff5e00');
      beam.addColorStop(.5, '#e8ffb5');
      beam.addColorStop(1, '#c7ff5e00');
      ctx.fillStyle = beam;
      ctx.shadowColor = '#c7ff5e';
      ctx.shadowBlur = 20;
      ctx.fillRect(state.player.x - 13, 0, 26, state.player.y - 15);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    for (const enemy of state.enemies) drawEnemy(enemy);
    ctx.shadowColor = '#64d8ff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#a4f3ff';
    for (const shot of state.shots) {
      ctx.fillRect(shot.x - 2, shot.y - 8, 4, 14);
      ctx.fillStyle = '#fff';
      ctx.fillRect(shot.x - 1, shot.y - 8, 2, 8);
      ctx.fillStyle = '#a4f3ff';
    }
    ctx.shadowColor = '#fc5b9b';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ff8cb8';
    for (const shot of state.enemyShots) {
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const particle of state.particles) {
      ctx.globalAlpha = Math.min(1, particle.life * 2);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    if (state.mode !== 'ready') drawShip();
    ctx.strokeStyle = '#ffffff10';
    ctx.beginPath();
    ctx.moveTo(0, H - 27);
    ctx.lineTo(W, H - 27);
    ctx.stroke();
  }

  let lastTime = 0;
  function frame(time) {
    const dt = Math.min((time - lastTime) / 1000 || 0, .04);
    lastTime = time;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  startButton.addEventListener('click', () => {
    if (state.mode === 'paused') begin();
    else {
      if (state.mode === 'gameover' || state.mode === 'won') {
        state.wave = 0;
        state.enemies = [];
      }
      begin();
    }
  });

  window.addEventListener('keydown', event => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (['ArrowLeft', 'ArrowRight', ' '].includes(key)) event.preventDefault();
    keys.add(key);
    if (!event.repeat && key === 'x') useLaser();
    if (!event.repeat && (key === 'p' || key === 'Escape')) togglePause();
    if (!event.repeat && key === 'Enter' && state.mode !== 'playing') startButton.click();
  });
  window.addEventListener('keyup', event => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys.delete(key);
  });
  window.addEventListener('blur', () => keys.clear());

  document.querySelectorAll('.touch-controls button').forEach(button => {
    const action = button.dataset.action;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (action === 'laser') useLaser();
      else if (action === 'left') keys.add('ArrowLeft');
      else if (action === 'right') keys.add('ArrowRight');
      else if (action === 'fire') keys.add(' ');
    });
    for (const name of ['pointerup', 'pointercancel', 'pointerleave']) {
      button.addEventListener(name, () => {
        if (action === 'left') keys.delete('ArrowLeft');
        else if (action === 'right') keys.delete('ArrowRight');
        else if (action === 'fire') keys.delete(' ');
      });
    }
  });

  soundButton.addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    if (state.soundOn) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        state.audioContext ||= new AudioContext();
        state.audioContext.resume();
      }
    }
    soundButton.setAttribute('aria-pressed', String(state.soundOn));
    soundButton.querySelector('.sound-state').textContent = state.soundOn ? 'ON' : 'OFF';
  });

  updateHud();
  requestAnimationFrame(frame);
})();
