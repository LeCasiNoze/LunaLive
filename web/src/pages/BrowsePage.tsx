export default function BrowsePage() {
  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Browse</h1>
        <p className="muted">
          Plus tard : mise en avant + recherche + annuaire streamers (admin picks).
        </p>
      </div>

      <div className="panel">
        <div className="panelTitle">À venir</div>
        <ul className="bullets">
          <li>Bloc “Featured” (admin)</li>
          <li>Search streamer</li>
          <li>Tags / catégories</li>
        </ul>
      </div>
    </main>
  );
}
