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
  /**
   * Reads the EXIF orientation tag from a JPEG file. Returns a Promise that
   * resolves with an orientation value (1 = default, 3 = 180°, 6 = 90°, 8 = -90°)
   * or -1 if no orientation tag is found or parsing fails.
   *
   * To avoid CORS restrictions when requesting images from GitHub raw URLs,
   * we proxy the request through corsproxy.io. Only the first portion of
   * the file is downloaded, so this should not significantly impact load times.
   *
   * @param {string} url - The URL of the image to examine.
   * @returns {Promise<number>}
   */
  function getOrientation(url) {
    return new Promise((resolve) => {
      // Proxy the request to bypass CORS. Without this prefix, GitHub raw
      // requests may fail to return the necessary headers to read the binary
      // data. The proxy simply relays the request and adds the appropriate
      // CORS headers.
      const proxied = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      fetch(proxied)
        .then((response) => response.arrayBuffer())
        .then((buffer) => {
          const view = new DataView(buffer);
          // JPEG files begin with 0xFFD8. If not present, bail out.
          if (view.getUint16(0, false) !== 0xFFD8) {
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
            } else if ((marker & 0xff00) !== 0xff00) {
              break;
            } else {
              offset += view.getUint16(offset, false);
            }
          }
          resolve(-1);
        })
        .catch(() => {
          // On any fetch or parsing error, fall back to -1.
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

            // Predefine a list of image identifiers (numeric parts of the filename)
            // that should be rotated 270 degrees (equivalent to -90 degrees).
            const rotate270List = ['1242','1773','1963','3758','3864','2691','3024','4243'];
            // If the current file's name includes any of these identifiers,
            // apply the rotation immediately. This overrides EXIF orientation
            // handling and natural dimension heuristics, since these images
            // were specifically requested to be rotated.
            // Determine if this image is explicitly listed to be rotated 270°.
            let rotateOverride = false;
            for (const code of rotate270List) {
              if (file.name.toLowerCase().includes(code)) {
                rotateOverride = true;
                img.style.transform = 'rotate(-90deg)';
                img.style.width = 'auto';
                img.style.height = '320px';
                break;
              }
            }

            // Detect orientation using EXIF metadata via getOrientation().
            // Only apply rotation when the EXIF tag indicates the image
            // should be rotated (orientation values 3, 6, or 8). We no longer
            // rotate based on natural dimensions, as many mobile devices
            // record all photos in landscape orientation and rely solely on
            // EXIF tags for correct display. Relying on natural dimensions
            // previously caused improperly oriented images to be rotated
            // unexpectedly. If no orientation tag exists, the image will be
            // displayed as-is.
            // Only run orientation detection logic when no manual override is specified.
            if (!rotateOverride) {
              getOrientation(file.download_url).then((orientation) => {
                // Apply rotations based on EXIF metadata. Orientation values
                // 6 and 8 correspond to 90° and -90° rotations respectively,
                // while 3 corresponds to a 180° flip.
                if (orientation === 6) {
                  img.style.transform = 'rotate(90deg)';
                  img.style.width = 'auto';
                  img.style.height = '320px';
                } else if (orientation === 8) {
                  img.style.transform = 'rotate(-90deg)';
                  img.style.width = 'auto';
                  img.style.height = '320px';
                } else if (orientation === 3) {
                  img.style.transform = 'rotate(180deg)';
                } else {
                  // If no useful orientation tag exists (orientation 1 or -1),
                  // inspect the loaded image dimensions to detect sideways
                  // photos. Many phone cameras record all photos in the same
                  // orientation and rely solely on EXIF to correct them. If
                  // the photo’s natural height is greater than its natural
                  // width, we treat it as sideways and rotate it 270° (equivalent
                  // to -90°) so faces appear upright. Without this fallback, images
                  // lacking EXIF orientation but captured in portrait mode remain
                  // sideways.
                  img.addEventListener('load', () => {
                    if (img.naturalHeight > img.naturalWidth) {
                      img.style.transform = 'rotate(-90deg)';
                      img.style.width = 'auto';
                      img.style.height = '320px';
                    }
                  });
                }
              });
            }

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

  // Play background music on the highlights page if available. The audio
  // element with id="bgmHighlights" should be defined in highlights.html
  // with a valid MP3 source. Autoplay policies in browsers may prevent
  // playback until the user interacts with the page; however, we still
  // attempt to start the music once the metadata has loaded.
  const bgmHighlights = document.getElementById('bgmHighlights');
  if (bgmHighlights) {
    bgmHighlights.volume = 0.4;
    const OFFSET = 53; // seconds to skip at the start of each loop
    const handleHighlightsReady = () => {
      try {
        // Seek to the offset once the audio is ready
        if (!isNaN(bgmHighlights.duration) && bgmHighlights.duration > OFFSET) {
          bgmHighlights.currentTime = OFFSET;
        }
      } catch (e) {
        // seeking may fail on some browsers; ignore
      }
      bgmHighlights.play().catch(() => {});
      bgmHighlights.removeEventListener('canplay', handleHighlightsReady);
    };
    // When the audio ends, restart it from the offset rather than the beginning
    bgmHighlights.addEventListener('ended', () => {
      try {
        bgmHighlights.currentTime = OFFSET;
      } catch (e) {
        // ignore seeking errors
      }
      bgmHighlights.play().catch(() => {});
    });
    if (bgmHighlights.readyState >= 2) {
      handleHighlightsReady();
    } else {
      bgmHighlights.addEventListener('canplay', handleHighlightsReady);
    }
  }

  // Build stats cards
  if (statsContainer) {
    const stats = [
      { label: 'Nights spent together', value: 296 },
      { label: 'Dinners shared', value: 100 },
      { label: 'Stardew games played', value: 37 },
      { label: 'Hours of Star Wars watched', value: 25 },
      { label: 'Crafts made', value: 12 }
      ,{ label: 'Love for you', value: '∞' }
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