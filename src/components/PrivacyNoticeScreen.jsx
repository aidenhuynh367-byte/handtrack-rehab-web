function PrivacyNoticeScreen({ onContinue }) {
  // explains what we save before exercises start
  // no video or images are stored
  // guest data stays on this device

  return (
    <section className="screen privacy-screen">
      <div className="privacy-card">
        <div className="privacy-heading">
          <p className="section-kicker">Privacy & data notice</p>
          <h2>Your privacy comes first</h2>
          <p>
            HandTrack Rehab is designed to track movement progress without saving
            unnecessary personal data.
          </p>
        </div>

        <div className="privacy-sections">
          <PrivacySection
            title="What we do not save"
            text="We do not save webcam video, photos, or raw movement recordings."
          />
          <PrivacySection
            title="What we save"
            text="If you are signed in, we save your exercise results, scores, selected hand, exercise type, and session dates so you can view your progress over time."
          />
          <PrivacySection
            title="Guest mode"
            text="If you continue as a guest, your session data stays on this device and is not saved to your online account."
          />
          <PrivacySection
            title="Important note"
            text="This app is not a medical diagnosis tool. It is designed to help you track exercise performance and share progress information with a clinician if you choose."
          />
        </div>

        <button className="primary-button" type="button" onClick={onContinue}>
          I understand — continue
        </button>
      </div>
    </section>
  )
}

function PrivacySection({ title, text }) {
  return (
    <section className="privacy-section">
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  )
}

export default PrivacyNoticeScreen
