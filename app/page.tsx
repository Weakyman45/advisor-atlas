const previewProfessors = [
  { rank: "01", name: "Chenhao Tan", school: "University of Chicago", track: "Human-centered AI", score: "82.3", status: "Not contacted" },
  { rank: "02", name: "Qian Yang", school: "Cornell University", track: "Human–AI design", score: "69.6", status: "Not contacted" },
  { rank: "03", name: "Diyi Yang", school: "Stanford University", track: "NLP + social computing", score: "81.0", status: "Application only" },
  { rank: "04", name: "Sherry Tongshuang Wu", school: "Carnegie Mellon University", track: "Human-centered NLP", score: "76.1", status: "Application only" },
  { rank: "05", name: "Haiyi Zhu", school: "Carnegie Mellon University", track: "Responsible AI", score: "75.0", status: "Not contacted" },
];

export default function Home() {
  return (
    <main className="site-shell">
      <header className="topbar">
        <div className="brand-mark">LY</div>
        <div>
          <p className="eyebrow">Fall 2027 · PhD applications</p>
          <h1>Advisor outreach, without spreadsheet friction.</h1>
        </div>
        <button className="primary-button" type="button">Update progress</button>
      </header>

      <section className="intro-grid">
        <div className="intro-copy">
          <p className="section-kicker">Your research portfolio</p>
          <h2>One clear view of every professor, reply, and next move.</h2>
          <p>
            Track 141 research-fit leads across the US, Hong Kong, and Singapore.
            Priorities, recruiting signals, follow-ups, and applications stay together.
          </p>
        </div>
        <div className="stat-grid" aria-label="Application statistics">
          <article><span>Total professors</span><strong>141</strong><small>38 institutions</small></article>
          <article><span>Priority portfolio</span><strong>45</strong><small>ranked and scored</small></article>
          <article><span>Contacted</span><strong>0</strong><small>ready for outreach</small></article>
          <article><span>Replies</span><strong>0</strong><small>response rate 0%</small></article>
        </div>
      </section>

      <section className="tracker-card">
        <div className="tracker-heading">
          <div>
            <p className="section-kicker">Priority queue</p>
            <h2>Start with the strongest matches</h2>
          </div>
          <div className="filter-preview">Search professors, schools, or research…</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Rank</th><th>Professor</th><th>Research fit</th><th>Score</th><th>Progress</th></tr></thead>
            <tbody>
              {previewProfessors.map((professor) => (
                <tr key={professor.name}>
                  <td className="rank-cell">{professor.rank}</td>
                  <td><strong>{professor.name}</strong><span>{professor.school}</span></td>
                  <td><span className="track-pill">{professor.track}</span></td>
                  <td><span className="score-badge">{professor.score}</span></td>
                  <td><span className="status-pill">{professor.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
