export default function FullPageMessage({ title, message }) {
  return (
    <main className="full-page-message">
      <section className="message-card">
        <h1>{title}</h1>
        {message ? <p>{message}</p> : null}
      </section>
    </main>
  );
}
