// Confetti effect reused from the original site
(() => {
  const canvas = document.getElementById("confetti");
  if (!canvas) return;
  const btn = document.getElementById("confettiBtn");
  const ctx = canvas.getContext("2d", { alpha: true });
  let w, h, raf = null;
  const pieces = [];

  function resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    w = canvas.width = Math.floor(window.innerWidth * dpr);
    h = canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rand(min, max){ return Math.random() * (max - min) + min; }

  function burst() {
    for (let i = 0; i < 180; i++) {
      pieces.push({
        x: rand(0, window.innerWidth),
        y: rand(-40, -10),
        r: rand(2, 6),
        vx: rand(-1.8, 1.8),
        vy: rand(2.4, 5.4),
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.14, 0.14),
        life: rand(70, 140),
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.vy += 0.03; // gravity
      p.life -= 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // Use a small palette via HSL without hardcoding specific colors
      ctx.fillStyle = `hsl(${Math.floor(rand(0, 360))} 90% 55% / 0.95)`;
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.restore();
      if (p.life <= 0 || p.y > window.innerHeight + 60) {
        pieces.splice(i, 1);
      }
    }
    if (pieces.length) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = null;
    }
  }

  window.addEventListener("resize", resize);
  resize();

  // Button click triggers burst
  btn?.addEventListener("click", burst);
  // Pressing Space also throws confetti
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") burst();
  });
})();

// Gallery, playlist and stats builder
(() => {
  const gallery = document.getElementById('gallery');
  const videoEl = document.getElementById('playlistVideo');
  const statsContainer = document.getElementById('statsContainer');

  // We used to read EXIF metadata to determine orientation. However, remote
  // images served from GitHub may not reliably expose orientation via
  // JavaScript due to CORS and caching. Instead, we rely on the browser’s
  // support for `image-orientation: from-image` and use natural
  // dimensions to adjust the display sizes of landscape versus portrait
  // photos. This keeps the gallery simple and avoids gaps beneath
  // landscape images.

  // If none of these exist on the page, nothing to do
  if (!gallery && !videoEl && !statsContainer) return;

  // Fetch asset list from GitHub API. We reference the user's repository directly so
  // images and videos do not need to be embedded in this repo. GitHub's API sends
  // CORS headers so it can be safely called from the browser.
  fetch('https://api.github.com/repos/farahes/birthday-scrapbook/contents/assets/img?ref=main')
    .then(r => r.json())
    .then(files => {
      // Build gallery of photos. Only include actual photo assets – those that
      // begin with "IMG" and end in jpg, jpeg or png. This filters out
      // decorative backgrounds like filmstrip and scrapbook textures.
      if (gallery) {
        const tapes = ['tape--a','tape--b','tape--c'];
        // Reasons why I love him. These will be cycled through if there are
        // more images than reasons. Feel free to expand this list in the
        // future to personalize further.
        const reasons = [
          'You always make me laugh until my cheeks hurt.',
          'You’re my favourite adventure partner.',
          'You have the kindest heart I know.',
          'You make ordinary moments feel extraordinary.',
          'Your smile lights up every room.',
          'You support and believe in me endlessly.',
          'You always surprise me with your thoughtfulness.',
          'You make even the simple things fun.'
        ];
        let reasonIndex = 0;
        files.forEach(file => {
          // Only consider image assets that begin with "IMG". Exclude decorative
          // background files like filmstrip and textures.
          if (/^IMG.*\.(jpe?g|png)$/i.test(file.name)) {
            const fig = document.createElement('figure');
            fig.className = 'polaroid';
            const img = document.createElement('img');
            // Use the raw GitHub download URL so images come straight from
            // farahes/birthday-scrapbook rather than this repo’s assets folder.
            img.src = file.download_url;
            img.alt = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
            img.loading = 'lazy';

            // After the image has loaded, determine whether it is landscape
            // or portrait by comparing natural dimensions. Landscape images
            // are given a smaller height and fill the width of the card,
            // while portrait images remain taller with a fixed height. This
            // prevents a large whitespace area beneath landscape photos and
            // keeps caption spacing consistent.
            img.addEventListener('load', () => {
              const isLandscape = img.naturalWidth > img.naturalHeight;
              if (isLandscape) {
                // Landscape: fill the width of the polaroid and crop if
                // necessary to avoid large empty space. Height is reduced.
                img.style.width = '100%';
                img.style.height = '220px';
                img.style.objectFit = 'cover';
              } else {
                // Portrait: maintain max height and allow width to scale
                img.style.width = 'auto';
                img.style.height = '320px';
                img.style.objectFit = 'cover';
              }
            });

            fig.appendChild(img);
            const cap = document.createElement('figcaption');
            // Assign a reason for this image. Cycle through if there are
            // more images than reasons.
            cap.textContent = reasons[reasonIndex % reasons.length];
            reasonIndex++;
            fig.appendChild(cap);
            const tapeSpan = document.createElement('span');
            tapeSpan.className = 'tape ' + tapes[Math.floor(Math.random()*tapes.length)];
            fig.appendChild(tapeSpan);
            gallery.appendChild(fig);
          }
        });

        // After all images are appended, set up an IntersectionObserver to
        // reveal each polaroid as it enters the viewport. We also assign
        // random rotation and slight translation offsets to create a
        // scattered, organic layout. Without this, polaroids appear in
        // perfectly aligned rows. The random offsets are modest to avoid
        // overlapping text or overflowing outside the page.
        const obs = new IntersectionObserver((entries, observer) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const el = entry.target;
              // Random rotation between -4deg and +4deg
              const angle = (Math.random() * 8) - 4;
              el.style.setProperty('--angle', `${angle}deg`);
              // Random small translations in X and Y (-12px to +12px)
              const dx = (Math.random() * 24) - 12;
              const dy = (Math.random() * 24) - 12;
              el.style.setProperty('--dx', `${dx}px`);
              el.style.setProperty('--dy', `${dy}px`);
              el.classList.add('visible');
              observer.unobserve(el);
            }
          });
        }, { threshold: 0.15 });
        document.querySelectorAll('.polaroid').forEach(p => obs.observe(p));
      }
      // Build video playlist on the video page. We gather all .MOV files and
      // stream them one after another using a single <video> element. The
      // source and poster attributes point to the raw GitHub download URLs.
      if (videoEl) {
        const videoFiles = files.filter(f => /\.mov$/i.test(f.name));
        let index = 0;
        const loadVideo = () => {
          if (index >= videoFiles.length) return;
          const fileInfo = videoFiles[index];
          videoEl.src = fileInfo.download_url;
          // Provide a poster image if there is a matching JPEG for the current MOV
          const jpegName = fileInfo.name.replace(/\.MOV/i, '.JPEG');
          const match = files.find(f => f.name === jpegName);
          if (match) {
            videoEl.poster = match.download_url;
          } else {
            videoEl.removeAttribute('poster');
          }
        };
        videoEl.addEventListener('ended', () => {
          index++;
          if (index < videoFiles.length) {
            loadVideo();
            videoEl.play();
          }
        });
        // Kick off the first video
        loadVideo();
        // Ensure the video is muted by default to avoid overlapping audio with
        // the background music. This also satisfies autoplay policies in
        // modern browsers.
        videoEl.muted = true;
        // Play background music on this page if available. The audio file
        // should be placed at assets/audio/time_of_our_lives.mp3 as defined
        // in videos.html. Volume is set low and audio loops automatically.
        const bgm = document.getElementById('bgm');
        if (bgm) {
          bgm.volume = 0.4;
          const offset = 40;
          // When the audio can start playing, seek to the desired offset and play.
          const handleCanPlay = () => {
            try {
              if (!isNaN(bgm.duration) && bgm.duration > offset) {
                bgm.currentTime = offset;
              }
            } catch (e) {
              // ignore seeking errors
            }
            bgm.play().catch(() => {});
            bgm.removeEventListener('canplay', handleCanPlay);
          };
          // If the audio is already ready, call the handler; otherwise wait.
          if (bgm.readyState >= 2) {
            handleCanPlay();
          } else {
            bgm.addEventListener('canplay', handleCanPlay);
          }
        }
      }
    });

  // Build stats cards
  if (statsContainer) {
    const stats = [
      { label: 'Nights spent together', value: 296 },
      { label: 'Dinners shared', value: 100 },
      { label: 'Stardew games played', value: 37 },
      { label: 'Hours of Star Wars watched', value: 25 },
      { label: 'Crafts made', value: 12 }
    ];
    stats.forEach(s => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = `<h3>${s.label}</h3><p class="stat-value">${s.value}</p>`;
      const valEl = card.querySelector('.stat-value');
      valEl.style.display = 'none';
      card.addEventListener('click', () => {
        if (valEl.style.display === 'none') {
          valEl.style.display = 'block';
        } else {
          valEl.style.display = 'none';
        }
      });
      statsContainer.appendChild(card);
    });
  }
})();