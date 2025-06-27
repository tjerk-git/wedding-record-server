const sections = document.querySelectorAll('section');
const promptElement = document.getElementById('prompt');
const timerElementSection1 = document.getElementById('timer_section1');
const recordTimerElement = document.getElementById('record_timer');
const videoContainer = document.getElementById('video');
// Set the video element to the specified video and play it
const videoDiv = document.getElementById('video');
const screenshotContainer = document.getElementById('screenshot_container'); // New element to display screenshot

let currentSection = 0;

const prompts = [
    "Wat zijn de eigenschappen die Marlies in Thomas het meest bewonderen in elkaar?",
    "Wat is een typische gezamenlijke hobby van Marlies en Thomas?",
    "Wie van de twee had als eerste een oogje op de ander?",
    "Waar kijken Marlies en Thomas het meest naar uit in hun huwelijk?",
    "Wat is Marlies' geheime superkracht waar Thomas dagelijks van profiteert?",
    "Wat is Thomas zijn geheime superkracht waar Marlies dagelijks van profiteert?",
    "Wat is het gekste wat Marlies & Thomas hebben meegemaakt vóór hun bruiloft?",
    "Wat is het eerste wat Marlies & Thomas zouden doen als ze per ongeluk een miljoen winnen?",
    "Als Marlies & Thomas een band zouden beginnen, hoe heet deze band en wat voor muziek maken ze?",
    "Wat is hun domste gezamenlijke aankoop ooit?",
];

let mediaRecorder;
let recordedChunks = [];
let currentStream;
let enterDisabled = false;
let screenshotData = null; // Global variable to store screenshot data

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !enterDisabled) {
        event.preventDefault(); // Prevent default browser behavior (e.g., form submission)
        handleShortEnterPress();
    }
});

/**
 * Handles the logic for a short Enter press.
 * Increments the currentSection and then executes the corresponding step.
 */
function handleShortEnterPress() {
    if (enterDisabled) return;
    currentSection++; // Advance for short press
    executeStep(currentSection);
}


/**
 * Executes the code associated with the given step (currentSection).
 * This function centralizes all step-by-step logic.
 * @param {number} step The current step number to execute.
 */
function executeStep(step) {
    // Ensure currentSection is within valid bounds
    if (step >= sections.length) {
        step = 0; // Reset to the first section if out of bounds
        stopAllStreams();
        enterDisabled = false;
    }
    currentSection = step; // Update global currentSection

    // Always update section display BEFORE trying to access elements within the section
    updateSectionDisplay();

    switch (currentSection) {
        case 0: // Initial screen or reset
            console.log("Executing Step 0: Initial/Reset Screen");

            if (videoDiv) {
                videoDiv.innerHTML = '<video id="intro_video" src="babbelbox_3_goeie_2x_speed.mov" autoplay loop muted></video>';
                const videoEl = videoDiv.querySelector('video');
                if (videoEl) {
                    videoEl.play().catch(() => {}); // In case autoplay is blocked, try to play
                }
            }
            // Ensure elements are cleared for a clean start
            if (promptElement) promptElement.textContent = '';
            if (timerElementSection1) timerElementSection1.textContent = '';
            if (recordTimerElement) recordTimerElement.textContent = ''; // Clear main recording timer as well
            if (screenshotContainer) screenshotContainer.innerHTML = ''; // Clear previous screenshot
            screenshotData = null; // Clear screenshot data on reset

            stopAllStreams();
            enterDisabled = false;
            break;

        case 1: // Display prompt and start countdown for recording
            console.log("Executing Step 1: Displaying Prompt & Starting Countdown");
            enterDisabled = true;

            if (videoDiv) {
                videoDiv.style.display = 'none';
            }

            let randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
            promptElement.textContent = randomPrompt;

            let countdown = 5;
            timerElementSection1.textContent = countdown; // Use the specific timer for section 1

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
                    enterDisabled = true; // Disable Enter during recording countdown and recording
                } else if (countdown === -1) {
                    timerElementSection1.textContent = "";
                    clearInterval(window.countdownInterval);
                }
            }, 1000);
            break;

        case 2: // Success screen with confetti and screenshot
            console.log("Executing Step 2: Success Screen");
            stopAllStreams();
            enterDisabled = false;

            uploadVideo();

            // Display the screenshot if available
            if (screenshotData && screenshotContainer) {
                screenshotContainer.innerHTML = ''; // Clear existing content
                const img = document.createElement('img');
                img.src = screenshotData;
                img.alt = "Screenshot of your recording start";
                img.style.maxWidth = "100%";
                img.style.height = "auto";
                img.style.display = "block";
                img.style.margin = "20px auto";
                screenshotContainer.appendChild(img);
            }

            // Confetti animation
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
            executeStep(0); // Go to the initial state
            break;
    }
}

async function uploadVideo() {
    const fileExtension = mediaRecorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
    const formData = new FormData();
    formData.append('video', blob, `recording.${fileExtension}`);
    formData.append('filename', 'recording');

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            // window.location.href = '/success.html';
        }
    } catch (error) {
        console.error('Upload failed:', error);
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
    const oldVideo = videoContainer ? videoContainer.querySelector('video:not(#playback)') : null;
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

    if (videoContainer) { // Ensure videoContainer exists before appending
        videoContainer.appendChild(videoElem);
    }


    // Get user media and start recording (video only, no audio)
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(function(stream) {
            console.log('Got media stream:', stream);
            videoElem.srcObject = stream;
            videoElem.muted = true; // Mute the LIVE preview (webcam)

            currentStream = stream;

            // Take screenshot after the video stream is active
            videoElem.onloadedmetadata = () => {
                if (videoElem.videoWidth && videoElem.videoHeight) {
                    const canvas = document.createElement('canvas');
                    canvas.width = videoElem.videoWidth;
                    canvas.height = videoElem.videoHeight;
                    const context = canvas.getContext('2d');
                    context.drawImage(videoElem, 0, 0, canvas.width, canvas.height);
                    screenshotData = canvas.toDataURL('image/png'); // Store the screenshot
                    console.log('Screenshot taken!');
                } else {
                    console.warn('Video element has no dimensions yet, cannot take screenshot.');
                }
                videoElem.onloadedmetadata = null; // Remove the event listener
            };


            // Check MediaRecorder support
            if (!MediaRecorder.isTypeSupported('video/webm')) {
                console.warn('video/webm not supported, trying video/mp4');
            }

            // Setup MediaRecorder
            recordedChunks = [];
            try {
                mediaRecorder = new MediaRecorder(stream);
                console.log('MediaRecorder created successfully');
            } catch (e) {
                console.error('Failed to create MediaRecorder:', e);
                return;
            }

            mediaRecorder.ondataavailable = function(event) {
                console.log('Data available:', event.data.size, 'bytes');
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                    console.log('Added chunk, total chunks:', recordedChunks.length);
                } else {
                    console.warn('Received empty data chunk');
                }
            };

            mediaRecorder.onstop = function() {
                window.recordedBlob = new Blob(recordedChunks, { type: 'video/webm' });
                console.log('Recording stopped, blob created');
                // The advanceToReviewScreen is now handled by the timer reaching 0 in startRecordingTimer
            };

            // Start recording
            mediaRecorder.start();

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

    // Clear any existing recording interval
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
            if (mediaRecorder && mediaRecorder.state === "recording") {
                mediaRecorder.stop();
                executeStep(2); // Advance to the success screen here
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
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }
}

// Cleanup when page is closed/refreshed
window.addEventListener('beforeunload', stopAllStreams);


// Initialize the first step when the page loads
document.addEventListener('DOMContentLoaded', () => {
    executeStep(0);
});