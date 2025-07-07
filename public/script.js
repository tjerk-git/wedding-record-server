const sections = document.querySelectorAll('section');
const promptElement = document.getElementById('prompt');
const timerElementSection1 = document.getElementById('timer_section1');
const recordTimerElement = document.getElementById('record_timer');
const intro = document.getElementById('intro');
const videoDiv = document.getElementById('video');
const screenshotContainer = document.getElementById('screenshot_container');
const bgElem = document.querySelector('.bg');

let currentSection = 0;

const prompts = [
    "Wat zijn de eigenschappen die Marlies in Thomas het meest bewonderen in elkaar?",
    "Wat is een typische gezamenlijke hobby van Marlies en Thomas?",
    "Wie van de twee had als eerste een oogje op de ander?",
    "Waar kijken Marlies en Thomas het meest naar uit in hun huwelijk?",
    "Wat is Marlies haar geheime superkracht waar Thomas dagelijks van profiteert?",
    "Wat is Thomas zijn geheime superkracht waar Marlies dagelijks van profiteert?",
    "Wat is het gekste wat Marlies & Thomas hebben meegemaakt vóór hun bruiloft?",
    "Wat is het eerste wat Marlies & Thomas zouden doen als ze per ongeluk een miljoen winnen?",
    "Als Marlies & Thomas een band zouden beginnen, hoe heet deze band en wat voor muziek maken ze?",
    "Wat is hun domste gezamenlijke aankoop ooit?",
    "Als Marlies & Thomas een jaar vrij zouden krijgen met een onbeperkt budget, wat zouden ze dan doen?",
    "Wat is hun gezamenlijke droomproject?",
    "Wie van de twee is het vaakst iets kwijt — en wat?",
    "Wie doet de afwas meestal — en waarom eigenlijk?",
    "Als hun relatie een boek was, wat zou de titel zijn?",
    "Welke dierentuin-dieren zouden Marlies & Thomas zijn (en waarom)?"
  ];

let mediaRecorder;
let recordedChunks = [];
let currentStream;
let enterDisabled = false;
let screenshotData = null;
let currentPromptText = '';
let recordingStopped = false; // Prevent double stop

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !enterDisabled) {
        event.preventDefault();
        handleShortEnterPress();
    }
});

function handleShortEnterPress() {
    if (enterDisabled) return;
    currentSection++;
    executeStep(currentSection);
}

function executeStep(step) {
    if (step >= sections.length) {
        step = 0;
        stopAllStreams();
        enterDisabled = false;
    }
    currentSection = step;
    updateSectionDisplay();

    switch (currentSection) {
        case 0:
            console.log("Executing Step 0: Initial/Reset Screen");
            if(videoDiv){
                videoDiv.style.display = 'none';
            }
            if(intro){
                intro.style.display = 'flex';
            }

            if (bgElem) {
                bgElem.style.opacity = '0.3';
            }


            if (promptElement) promptElement.textContent = '';
            if (timerElementSection1) timerElementSection1.textContent = '';
            if (recordTimerElement) recordTimerElement.textContent = '';
            if (screenshotContainer) screenshotContainer.innerHTML = '';
            screenshotData = null;
            currentPromptText = '';
            stopAllStreams();
            enterDisabled = false;
            break;

        case 1:
            if (bgElem) {
                bgElem.style.opacity = '0.2';
            }
            intro.style.display = 'none';
            console.log("Executing Step 1: Displaying Prompt & Starting Countdown");
            enterDisabled = true;
            let randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
            promptElement.textContent = randomPrompt;
            currentPromptText = randomPrompt;
            let countdown = 5;
            timerElementSection1.textContent =  countdown;
            if (window.countdownInterval) {
                clearInterval(window.countdownInterval);
            }
            window.countdownInterval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    timerElementSection1.textContent = countdown;
                } else if (countdown === 0) {
                    timerElementSection1.textContent = "go!";
       
                    startRecording();
                    enterDisabled = true;
                } else if (countdown === -1) {
                    timerElementSection1.textContent = "";
                    clearInterval(window.countdownInterval);
                }
            }, 1000);
            break;

        case 2:
            console.log("Executing Step 2: Success Screen");
            stopAllStreams();
            enterDisabled = false;
            uploadMedia(currentPromptText);
            if (screenshotData) {
                uploadScreenshot(screenshotData, currentPromptText);
            }
            if (screenshotData && screenshotContainer) {
                screenshotContainer.innerHTML = '';
                const img = document.createElement('img');
                img.src = screenshotData;
                img.alt = "Screenshot of your recording start";
                img.style.maxWidth = "100%";
                img.style.height = "auto";
                img.style.display = "block";
                img.style.margin = "20px auto";
                screenshotContainer.appendChild(img);
            }
            var duration = 2000;
            var end = Date.now() + duration;
            if (typeof confetti === "function") {
                confetti({
                    particleCount: 200,
                    spread: 120,
                    origin: { y: 0.6 }
                });
                confetti({
                    particleCount: 100,
                    angle: 90,
                    spread: 70,
                    origin: { x: 0.5, y: 0 }
                });
                confetti({
                    particleCount: 100,
                    angle: 0,
                    spread: 70,
                    origin: { x: 0, y: 0.5 }
                });
                confetti({
                    particleCount: 100,
                    angle: 180,
                    spread: 70,
                    origin: { x: 1, y: 0.5 }
                });
                confetti({
                    particleCount: 100,
                    angle: 270,
                    spread: 70,
                    origin: { x: 0.5, y: 1 }
                });
            }
            setTimeout(() => {
                executeStep(0);
            }, 5000);
            break;

        default:
            console.log(`Unhandled step: ${currentSection}. Resetting.`);
            executeStep(0);
            break;
    }
}

async function uploadMedia(promptText) {
    // Defensive: If no chunks, don't upload
    if (!recordedChunks || recordedChunks.length === 0) {
        console.error('No recordedChunks to upload!');
        return;
    }
    // Use the type of the first chunk if available, fallback to webm
    let mimeType = (recordedChunks[0] && recordedChunks[0].type) ? recordedChunks[0].type : (mediaRecorder && mediaRecorder.mimeType ? mediaRecorder.mimeType : 'video/webm');
    const fileExtension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(recordedChunks, { type: mimeType });
    console.log('Uploading video. Blob size:', blob.size, 'type:', blob.type, 'chunks:', recordedChunks.length);
    const formData = new FormData();
    formData.append('video', blob, `recording.${fileExtension}`);
    formData.append('prompt', promptText);

    try {
        const response = await fetch('/api/upload/video', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (result.success) {
            console.log('Video uploaded successfully!');
        } else {
            console.error('Video upload failed:', result.message);
        }
    } catch (error) {
        console.error('Video upload failed:', error);
    }
}

async function uploadScreenshot(imageData, promptText) {
    const byteString = atob(imageData.split(',')[1]);
    const mimeString = imageData.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });

    const formData = new FormData();
    formData.append('screenshot', blob, 'screenshot.png');
    formData.append('prompt', promptText);

    try {
        const response = await fetch('/api/upload/screenshot', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            console.log('Screenshot uploaded successfully!');
            loadImages();
        } else {
            console.error('Screenshot upload failed:', result.message);
        }
    } catch (error) {
        console.error('Screenshot upload failed:', error);
    }
}

function updateSectionDisplay() {
    sections.forEach((section, index) => {
        if (index === currentSection) {
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
        }
    });
}

function startRecording() {
    // Remove any previous video element
    const oldVideo = videoDiv ? videoDiv.querySelector('video:not(#playback)') : null;
    if (oldVideo) {
        oldVideo.remove();
    }

    videoDiv.style.display = 'block';

    // Create new video element for webcam
    const videoElem = document.createElement('video');
    videoElem.setAttribute('autoplay', true);
    videoElem.setAttribute('playsinline', true);
    videoElem.style.width = "100%";
    videoElem.style.height = "100%";
    videoElem.style.objectFit = "cover";
    videoElem.style.position = "absolute";
    videoElem.style.top = "0";
    videoElem.style.left = "0";
    videoElem.style.zIndex = "-1";

    if (videoDiv) {
        videoDiv.appendChild(videoElem);
    }

    // Get user media and start recording (video and audio)
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(function(stream) {
            console.log('Got media stream:', stream);
            videoElem.srcObject = stream;
            videoElem.muted = true;
            currentStream = stream;

            // Check for audio tracks
            const hasAudio = stream.getAudioTracks().length > 0;
            if (!hasAudio) {
                console.warn('No audio tracks found in stream!');
            }

            // Take screenshot after the video stream is active
            videoElem.onloadedmetadata = () => {
                setTimeout(() => {
                    if (videoElem.videoWidth && videoElem.videoHeight) {
                        const canvas = document.createElement('canvas');
                        canvas.width = videoElem.videoWidth;
                        canvas.height = videoElem.videoHeight;
                        const context = canvas.getContext('2d');
                        context.drawImage(videoElem, 0, 0, canvas.width, canvas.height);
                        screenshotData = canvas.toDataURL('image/png');
                        console.log('Screenshot taken after 5 seconds!');
                    } else {
                        console.warn('Video element has no dimensions yet, cannot take screenshot.');
                    }
                }, 5000);
                videoElem.onloadedmetadata = null;
            };

            // --- MediaRecorder setup ---
            recordedChunks = [];
            recordingStopped = false;

            // Find a supported MIME type
            let mimeType = '';
            if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
                mimeType = 'video/webm;codecs=vp9,opus';
            } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
                mimeType = 'video/webm;codecs=vp8,opus';
            } else if (MediaRecorder.isTypeSupported('video/webm')) {
                mimeType = 'video/webm';
            } else if (MediaRecorder.isTypeSupported('video/mp4')) {
                mimeType = 'video/mp4';
            } else {
                mimeType = '';
            }

            try {
                if (mimeType) {
                    mediaRecorder = new MediaRecorder(stream, { mimeType });
                } else {
                    mediaRecorder = new MediaRecorder(stream);
                }
                console.log('MediaRecorder created successfully with mimeType:', mediaRecorder.mimeType);
            } catch (e) {
                console.error('Failed to create MediaRecorder:', e);
                alert('MediaRecorder could not be created: ' + e.message);
                return;
            }

            mediaRecorder.ondataavailable = function(event) {
                console.log('ondataavailable: event.data.size =', event.data.size, 'type:', event.data.type);
                if (event.data && event.data.size > 0) {
                    recordedChunks.push(event.data);
                    console.log('Added chunk, total chunks:', recordedChunks.length);
                } else {
                    console.warn('Received empty data chunk');
                }
            };

            mediaRecorder.onerror = function(e) {
                console.error('MediaRecorder error:', e);
            };

            mediaRecorder.onstart = function() {
                console.log('MediaRecorder started');
            };

            mediaRecorder.onstop = function() {
                if (recordingStopped) return;
                recordingStopped = true;
                console.log('MediaRecorder stopped. Total chunks:', recordedChunks.length);
                if (recordedChunks.length === 0) {
                    console.error('No data was recorded!');
                } else {
                    let totalSize = recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0);
                    console.log('Total recorded size:', totalSize, 'bytes');
                }
                window.recordedBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
                // Only now advance to the next step
                setTimeout(() => {
                    executeStep(2);
                }, 100); // Small delay to ensure all data is flushed
            };

            // Start recording with a timeslice to force periodic dataavailable events
            // 1000ms = 1s, so we get at least one chunk per second
            try {
                mediaRecorder.start(1000);
                console.log('mediaRecorder.start(1000) called');
            } catch (e) {
                console.error('mediaRecorder.start failed:', e);
                alert('Recording could not be started: ' + e.message);
                return;
            }

            // Start recording timer
            startRecordingTimer();
        })
        .catch(function(err) {
            console.error('Error accessing media devices:', err);
            alert('Kan geen toegang krijgen tot camera/microfoon: ' + err.message);
        });
}

function startRecordingTimer() {
    let recordCountdown = 10;
    recordTimerElement.textContent = recordCountdown;
    if (window.recordInterval) {
        clearInterval(window.recordInterval);
    }
    window.recordInterval = setInterval(() => {
        recordCountdown--;
        if (recordCountdown > 0) {
            recordTimerElement.textContent = recordCountdown;
        } else {
            recordTimerElement.textContent = "";
            clearInterval(window.recordInterval);
            // Stop recording when timer reaches 0
            if (mediaRecorder && mediaRecorder.state === "recording" && !recordingStopped) {
                console.log('Calling mediaRecorder.stop() after timer');
                mediaRecorder.stop();
                // Do NOT call executeStep(2) here; wait for onstop event!
            }
        }
    }, 1000);
}

function stopAllStreams() {
    // Stop all media streams
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    // Clear intervals
    if (window.countdownInterval) {
        clearInterval(window.countdownInterval);
        window.countdownInterval = null;
    }
    if (window.recordInterval) {
        clearInterval(window.recordInterval);
        window.recordInterval = null;
    }
    // Stop media recorder
    if (mediaRecorder && mediaRecorder.state === "recording" && !recordingStopped) {
        console.log('Calling mediaRecorder.stop() from stopAllStreams');
        mediaRecorder.stop();
        recordingStopped = true;
    }
}

window.addEventListener('beforeunload', stopAllStreams);

function loadImages(){
     console.log('loading images');
     fetch('/api/images')
     .then(response => response.json())
     .then(data => {
         let imagesContainer = document.getElementById('images_container');
         imagesContainer.innerHTML = "";
         if (data.images && data.images.length > 0) {
             data.images.forEach((filename, index) => {
                 const img = document.createElement('img');
                 img.src = `/uploads/${filename}`;
                 img.alt = filename;
                 img.style.maxWidth = '200px';
                 img.style.maxHeight = '150px';
                 img.style.objectFit = 'cover';
                 img.style.borderRadius = '8px';
                 if (index === data.images.length - 1) {
                     img.classList.add('new-image');
                 }
                 imagesContainer.appendChild(img);
             });
         }
     })
     .catch(err => {
         document.getElementById('images_container').textContent = 'Failed to load images.';
     });
}

document.addEventListener('DOMContentLoaded', () => {
    executeStep(0);
    loadImages();
});