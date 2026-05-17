import {
  SignInButton,
  SignUpButton,
  UserButton,
  SignedIn,
  SignedOut,
} from '@clerk/nextjs';
import Script from 'next/script';

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function Page() {
  return (
    <main>
      <nav className="topnav">
        {clerkEnabled ? (
          <>
            <SignedOut>
              <SignInButton mode="modal">
                <button type="button" className="secondary">Sign in</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button type="button" className="primary">Sign up</button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </>
        ) : (
          <span className="dev-mode-pill" title="Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in .env.local to enable auth.">
            Dev mode · no auth
          </span>
        )}
      </nav>

      <header>
        <h1>Voice to Guitar Tab</h1>
        <p className="subtitle">
          Hum a melody. On stop, Spotify&apos;s Basic Pitch neural net transcribes it into a guitar tab.
        </p>
      </header>

      <section className="controls">
        <button id="recordBtn" className="primary" type="button">Start Recording</button>
        <button id="playBtn" className="secondary" type="button" disabled>Play</button>
        <button id="clearBtn" className="secondary" type="button">Clear</button>
        <button id="settingsBtn" className="secondary" type="button" title="Transcription settings">⚙ Settings</button>
        <label className="tempo">
          Speed
          <input id="tempoInput" type="range" min="0.25" max="2" step="0.05" defaultValue="1" />
          <span id="tempoValue" className="freq">1.00× speed</span>
        </label>
      </section>

      <section className="status-bar">
        <div id="status" className="status">Ready</div>
        <div className="meter" aria-hidden="true">
          <div id="levelBar" className="meter-fill"></div>
        </div>
        <div className="current-pitch">
          <span className="label">Pitch:</span>
          <span id="currentNote" className="note">—</span>
          <span id="currentFreq" className="freq"></span>
        </div>
      </section>

      <section className="tab-output">
        <h2>Tablature (standard tuning)</h2>
        <div id="tabDisplay" className="tab"></div>
      </section>

      <section className="notes-log">
        <h2>Detected Notes</h2>
        <div id="notesLog" className="notes-list"></div>
      </section>

      <footer>
        <p>
          Tip: hum a short phrase, click Stop, then transcription runs. First
          run downloads TensorFlow.js + Basic Pitch model. Click any detected
          note to edit it. Free plan caps each recording at 10 seconds —
          upgrade to record longer.
        </p>
      </footer>

      {/* --- Settings modal --- */}
      <div id="settingsModal" className="modal" hidden>
        <div className="modal-backdrop" data-close-modal></div>
        <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
          <div className="modal-header">
            <h2 id="settingsTitle">Transcription settings</h2>
            <button className="modal-close" type="button" data-close-modal title="Close">×</button>
          </div>
          <div className="modal-body">
            <p className="modal-intro">Do you like to provide additional information?</p>
            <label className="modal-radio">
              <input type="radio" name="settingsMode" value="auto" defaultChecked />
              <span>No, automatically <strong>detect</strong> tempo and quantize.</span>
            </label>
            <label className="modal-radio">
              <input type="radio" name="settingsMode" value="manual" />
              <span>I wish to add <strong>more options</strong> for definite results.</span>
            </label>
            <div className="form-grid" id="manualSettings">
              <label className="form-field">
                <span className="form-label">TEMPO</span>
                <span className="form-input-row">
                  <input id="tempoBpmInput" type="number" min="40" max="220" defaultValue="120" />
                  <span className="form-suffix">BPM</span>
                </span>
              </label>
              <label className="form-field">
                <span className="form-label">NOTE DURATION QUANTIZATION</span>
                <select id="quantSelect" defaultValue="sixteenth">
                  <option value="off">Off (keep recorded timing)</option>
                  <option value="quarter">Quarter</option>
                  <option value="eighth">Eighth</option>
                  <option value="sixteenth">Sixteenth</option>
                </select>
              </label>
              <label className="form-field">
                <span className="form-label">TRIPLETS RECOGNITION</span>
                <select id="tripletsSelect" defaultValue="no">
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button className="secondary" type="button" data-close-modal>Cancel</button>
            <button id="settingsApplyBtn" className="primary" type="button">Apply</button>
          </div>
        </div>
      </div>

      {/* --- Paywall modal --- */}
      <div id="paywallModal" className="modal" hidden>
        <div className="modal-backdrop" data-close-paywall></div>
        <div className="modal-panel" role="dialog" aria-modal="true">
          <div className="modal-header">
            <h2>Upgrade to keep recording</h2>
            <button className="modal-close" type="button" data-close-paywall title="Close">×</button>
          </div>
          <div className="modal-body">
            <p className="modal-intro">
              Free plan limits recording to <strong>10 seconds</strong>. Upgrade for unlimited recording, longer melodies, and saved sessions.
            </p>
            <div className="pricing-grid">
              <div className="price-card">
                <div className="price-label">Monthly</div>
                <div className="price-amount">$4.99<span className="price-period">/mo</span></div>
                <button id="subscribeMonthlyBtn" className="primary" type="button">Subscribe</button>
              </div>
              <div className="price-card featured">
                <div className="price-badge">Save 17%</div>
                <div className="price-label">Yearly</div>
                <div className="price-amount">$49.99<span className="price-period">/yr</span></div>
                <button id="subscribeYearlyBtn" className="primary" type="button">Subscribe</button>
              </div>
            </div>
            <p className="modal-fineprint" id="paywallSignInHint">
              Sign in first to subscribe.
            </p>
          </div>
          <div className="modal-footer">
            <button className="secondary" type="button" data-close-paywall>Maybe later</button>
          </div>
        </div>
      </div>

      {/* --- Note edit popover --- */}
      <div id="notePopover" className="note-popover" hidden>
        <button type="button" className="popover-btn" data-action="down" title="Down a semitone">↓</button>
        <span id="popoverNoteName" className="popover-name">—</span>
        <button type="button" className="popover-btn" data-action="up" title="Up a semitone">↑</button>
        <button type="button" className="popover-btn popover-delete" data-action="delete" title="Delete this note">×</button>
      </div>

      <Script
        src="https://cdn.jsdelivr.net/npm/tone@15.0.4/build/Tone.js"
        strategy="beforeInteractive"
      />
      <Script src="/js/app.js" type="module" strategy="afterInteractive" />
    </main>
  );
}
