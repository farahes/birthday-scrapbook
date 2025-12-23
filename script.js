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

  /**
   * Reads the EXIF orientation tag from a JPEG file. Returns a Promise that
   * resolves with an orientation value (1 = default, 3 = 180°, 6 = 90°, 8 = -90°)
   * or -1 if no orientation tag is found or parsing fails.
   *
   * Note: This function only fetches the header portion of the file and
   * therefore should not significantly impact page load times. If it cannot
   * determine the orientation, it resolves to -1.
   *
   * @param {string} url - The URL of the image to examine.
   * @returns {Promise<number>}
   */
  function getOrientation(url) {
    return new Promise((resolve, reject) => {
      fetch(url)
        .then(response => response.arrayBuffer())
        .then(buffer => {
          const view = new DataView(buffer);
          if (view.getUint16(0, false) !== 0xFFD8) {
            // Not a JPEG
            resolve(-1);
            return;
          }
          let offset = 2;
          const length = view.byteLength;
          while (offset < length) {
            const marker = view.getUint16(offset, false);
            offset += 2;
            // APP1 marker
            if (marker === 0xFFE1) {
              // Check for EXIF header (0x45786966 = 'Exif' in ASCII)
              if (view.getUint32(offset + 2, false) !== 0x45786966) {
                // Not EXIF
                break;
              }
              const little = view.getUint16(offset + 8, false) === 0x4949;
              const exifOffset = offset + 10;
              const tiffOffset = exifOffset + view.getUint32(exifOffset + 4, little);
              const tags = view.getUint16(tiffOffset, little);
              for (let i = 0; i < tags; i++) {
                const tagOffset = tiffOffset + 2 + i * 12;
                const tag = view.getUint16(tagOffset, little);
                if (tag === 0x0112) {
                  const orientation = view.getUint16(tagOffset + 8, little);
                  resolve(orientation);
                  return;
                }
              }
              break;
            } else if ((marker & 0xFF00) !== 0xFF00) {
              break;
            } else {
              offset += view.getUint16(offset, false);
            }
          }
          resolve(-1);
        })
        .catch(err => {
          // Could not fetch or parse; consider as no orientation tag
          resolve(-1);
        });
    });
  }

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
          if (/^IMG.*\.(jpe?g|png)$/i.test(file.name)) {
            const fig = document.createElement('figure');
            fig.className = 'polaroid';
            const img = document.createElement('img');
            // Use the raw GitHub download URL so images come straight from
            // farahes/birthday-scrapbook rather than this repo’s assets folder.
            img.src = file.download_url;
            img.alt = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
            img.loading = 'lazy';
            // Detect orientation using EXIF metadata. We fetch the JPEG
            // header to read the orientation and then apply a CSS rotation
            // if needed. This ensures images are displayed upright and
            // correctly oriented regardless of device metadata.
            getOrientation(file.download_url).then((orientation) => {
              switch (orientation) {
                case 6: // Rotate 90 degrees
                  img.style.transform = 'rotate(90deg)';
                  break;
                case 8: // Rotate -90 degrees
                  img.style.transform = 'rotate(-90deg)';
                  break;
                case 3: // Rotate 180 degrees
                  img.style.transform = 'rotate(180deg)';
                  break;
                default:
                  // No rotation needed
                  break;
              }
            }).catch(() => {
              // If orientation detection fails, we do nothing and display
              // the image as-is.
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
          // Start the audio at 40 seconds. We wait until metadata is loaded so
          // that the duration is known, then seek and play. If metadata is
          // already loaded, we can immediately seek and play.
          const startAudio = () => {
            try {
              if (bgm.duration && bgm.duration > 40) {
                bgm.currentTime = 40;
              }
            } catch (e) {
              // ignore seeking errors
            }
            bgm.play().catch(() => {});
          };
          if (bgm.readyState >= 1) {
            startAudio();
          } else {
            bgm.addEventListener('loadedmetadata', startAudio, { once: true });
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