import type { Award, Creamery, Person } from "../types";
import { CONTEST, PLACEMENT, capabilities, cheeseOperations } from "../data";

interface Props {
  creamery: Creamery;
  people: Person[];
  awards: Award[];
  onClose: () => void;
}

export default function CreameryDetail({ creamery, people, awards, onClose }: Props) {
  const cheeses = cheeseOperations(creamery);
  const abilities = capabilities(creamery);
  const firsts = awards.filter((a) => a.placement === 1).length;

  return (
    <aside className="detail" aria-label={`${creamery.name} detail`}>
      <div className="detail-head">
        <button className="close" onClick={onClose} aria-label="Close detail">
          ×
        </button>
        <h2>{creamery.name}</h2>
        <div className="where">
          {creamery.city}
          {creamery.county ? ` · ${creamery.county} County` : ""}
        </div>
        <div className="tags" style={{ marginTop: "0.5rem" }}>
          {creamery.retail.store && <span className="pill store">Retail store</span>}
          {awards.length > 0 && (
            <span className="pill award">
              {awards.length} award{awards.length === 1 ? "" : "s"}
              {firsts > 0 ? ` · ${firsts} first` : ""}
            </span>
          )}
          {people.length > 0 && (
            <span className="pill">
              {people.length} master cheesemaker{people.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <section>
        <h3>Contact</h3>
        <p>
          {creamery.address}
          <br />
          {creamery.city}
          {creamery.county ? `, ${creamery.county} County` : ""}
        </p>
        {creamery.website && (
          <p>
            <a href={creamery.website} target="_blank" rel="noopener noreferrer">
              {creamery.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          </p>
        )}
        {creamery.aka.length > 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.82rem" }}>
            Also trades as: {creamery.aka.join(" · ")}
          </p>
        )}
      </section>

      {cheeses.length > 0 && (
        <section>
          <h3>Licensed to make</h3>
          <div className="tags">
            {cheeses.map((c) => (
              <span className="tag cheese" key={c}>
                {c}
              </span>
            ))}
          </div>
        </section>
      )}

      {people.length > 0 && (
        <section>
          <h3>Master cheesemakers</h3>
          {people.map((person) => (
            <div className="person" key={person.id}>
              <div className="who">{person.name}</div>
              <div className="tags" style={{ marginTop: "0.2rem" }}>
                {person.certifications.map((c) => (
                  <span className="tag" key={c.type}>
                    {c.type}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {awards.length > 0 && (
        <section>
          <h3>Contest awards</h3>
          {awards.map((award) => (
            <div className="award-row" key={award.id}>
              <span className="place">{PLACEMENT[award.placement]}</span>
              <span className="what">
                {award.entry.cheese_name}
                <span className="cls">
                  {CONTEST[award.contest]} {award.year} · class {award.class_number}{" "}
                  {award.class_name}
                  {award.finalist ? " · top-20 finalist" : ""}
                  {award.champion ? " · CHAMPION" : ""}
                </span>
              </span>
              {award.score !== null && <span className="score">{award.score.toFixed(3)}</span>}
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>
          Licensed plants ({creamery.plants.length})
        </h3>
        {creamery.plants.map((plant) => (
          <div className="plant" key={plant.datcp_id}>
            <div className="id">{plant.datcp_id}</div>
            <div className="addr">
              {plant.address}, {plant.city} · {plant.county} County
            </div>
            <div className="tags">
              {plant.operations.map((op) => (
                <span className="tag" key={op}>
                  {op}
                </span>
              ))}
            </div>
          </div>
        ))}
        {creamery.plants.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>
            No Wisconsin dairy plant licence on file — listed by Dairy Farmers of
            Wisconsin but not matched to a DATCP plant.
          </p>
        )}
        {abilities.length > 0 && (
          <>
            <h3 style={{ marginTop: "0.9rem" }}>Plant capabilities</h3>
            <div className="tags">
              {abilities.map((a) => (
                <span className="tag" key={a}>
                  {a}
                </span>
              ))}
            </div>
          </>
        )}
      </section>
    </aside>
  );
}
