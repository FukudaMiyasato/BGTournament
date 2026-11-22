import type { Metadata } from "next";
import Link from "next/link";
import { ELO, MVP_DAYS, eloChanges, expected } from "@/lib/stats";

export const metadata: Metadata = {
  title: "Cómo funciona · Boardgame Ranking",
  description: "Cómo se calcula el ranking y el Elo del torneo",
};

// Partida de ejemplo: 5 participantes, 3 puestos registrados
const EXAMPLE = [
  { id: "a", name: "Ana", elo: 1040, result: "1.º" },
  { id: "b", name: "Beto", elo: 980, result: "2.º" },
  { id: "c", name: "Caro", elo: 1100, result: "3.º" },
  { id: "d", name: "Dani", elo: 1000, result: "Sin puesto" },
  { id: "e", name: "Eva", elo: 940, result: "Sin puesto" },
];
const VERSUS = [
  "Promedio de Beto, Caro, Dani y Eva",
  "Promedio de Caro, Dani y Eva",
  "Promedio de Dani y Eva",
  "Caro (último puesto registrado)",
  "Caro (último puesto registrado)",
];

export default function Doc() {
  const rating = (id: string) => EXAMPLE.find((p) => p.id === id)!.elo;
  const ids = EXAMPLE.map((p) => p.id);
  const changes = eloChanges(rating, () => ELO.k, ids, ids.slice(0, 3));
  const rivals = [
    (980 + 1100 + 1000 + 940) / 4,
    (1100 + 1000 + 940) / 3,
    (1000 + 940) / 2,
    1100,
    1100,
  ];

  return (
    <main className="page">
      <header className="top">
        <h1>📖 Cómo funciona</h1>
        <Link href="/" className="btn ghost small">← Ranking</Link>
      </header>

      <article className="doc">
        <p>
          Boardgame Ranking lleva el ranking de nuestras partidas de juegos de mesa. Las partidas se registran por
          sesiones (una jornada de juego) y cuentan en el ranking cuando la sesión se sube.
        </p>

        <h2>El ranking</h2>
        <ul>
          <li>Solo aparecen quienes jugaron al menos una partida.</li>
          <li>
            Se puede ordenar por <strong>Elo</strong> (por defecto), <strong>Partidas ganadas</strong>,{" "}
            <strong>Promedio de victoria</strong> o <strong>Puntos</strong>.
          </li>
          <li>
            Cada jugador tiene su propio puesto. Si dos empatan, va primero{" "}
            <strong>quien llegó antes a ese valor</strong>.
          </li>
          <li>
            En Elo y en promedio de victoria hacen falta <strong>{ELO.minGames} partidas</strong> para entrar en
            la clasificación. Antes, el jugador aparece como “Provisional” y queda debajo de los clasificados:
            así nadie queda arriba por ir una sola vez y ganar.
          </li>
          <li>
            Se muestran los 10 primeros; con “Ver todos” se ve el resto. Las flechas ▲▼ indican cuánto subió o
            bajó cada uno respecto a la sesión anterior, y “Animar” reproduce ese cambio.
          </li>
        </ul>

        <h2>Qué es el Elo</h2>
        <p>
          El Elo es un puntaje que sube cuando ganas y baja cuando pierdes, pero <strong>cuánto</strong> se
          mueve depende de contra quién: ganarle a alguien con más Elo que tú da mucho, ganarle a alguien con
          menos da poco. Perder funciona al revés. Todos empiezan en <strong>{ELO.start}</strong>.
        </p>
        <div className="formula">
          <span>esperado = 1 / (1 + 10^((rival − propio) / 400))</span>
          <span>cambio = K × (resultado − esperado)</span>
        </div>
        <ul>
          <li>
            <strong>esperado</strong> es la probabilidad de ganar según los puntajes: 0,5 si son iguales, 0,64
            con 100 de ventaja, 0,76 con 200.
          </li>
          <li><strong>resultado</strong> es 1 si ganas el duelo y 0 si lo pierdes.</li>
          <li>
            <strong>K</strong> es lo máximo que se puede mover el puntaje en una partida: {ELO.k}, y {ELO.kNew}{" "}
            en las primeras {ELO.newGames} partidas de cada jugador, para que los nuevos lleguen rápido a su
            nivel.
          </li>
        </ul>

        <h2>Elo en una partida grupal</h2>
        <p>
          Una partida de varios jugadores se convierte en un duelo por jugador, siempre con los puntajes de
          antes de la partida:
        </p>
        <ol>
          <li>
            El <strong>1.º</strong> suma como si le hubiera ganado un duelo al <strong>promedio de todos los
            demás</strong> participantes.
          </li>
          <li>
            El <strong>2.º</strong>, el 3.º y los siguientes puestos suman como si le hubieran ganado al{" "}
            <strong>promedio de los que quedaron debajo</strong> de ellos (los puestos siguientes y los que no
            tienen puesto).
          </li>
          <li>
            Los que <strong>no tienen puesto</strong> restan como si hubieran perdido contra el{" "}
            <strong>último puesto registrado</strong>.
          </li>
          <li>
            Si todos tienen puesto, el último resta como si hubiera perdido contra el puesto anterior al suyo.
          </li>
          <li>Una partida sin ningún puesto registrado no mueve el Elo de nadie.</li>
        </ol>

        <h2>Ejemplo</h2>
        <p>Cinco participantes, tres puestos registrados y K = {ELO.k} para todos:</p>
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Jugador</th>
                <th className="num">Elo antes</th>
                <th>Resultado</th>
                <th>Se mide contra</th>
                <th className="num">Rival</th>
                <th className="num">Esperado</th>
                <th className="num">Cambio</th>
                <th className="num">Elo después</th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLE.map((p, i) => {
                const change = changes.get(p.id) ?? 0;
                return (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td className="num">{p.elo}</td>
                    <td>{p.result}</td>
                    <td>{VERSUS[i]}</td>
                    <td className="num">{Math.round(rivals[i])}</td>
                    <td className="num">{expected(p.elo, rivals[i]).toFixed(2).replace(".", ",")}</td>
                    <td className={`num ${change > 0 ? "up" : "down"}`}>
                      {change > 0 ? "+" : "−"}{Math.abs(change).toFixed(1).replace(".", ",")}
                    </td>
                    <td className="num"><strong>{Math.round(p.elo + change)}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p>
          Caro quedó 3.ª con el Elo más alto de la mesa: suma poco porque se esperaba que quedara por encima de
          Dani y Eva. Eva resta menos que Dani porque tenía menos Elo y su derrota contra Caro era más esperable.
        </p>

        <h2>Los otros modos</h2>
        <ul>
          <li><strong>Partidas ganadas</strong>: cantidad de primeros puestos.</li>
          <li><strong>Promedio de victoria</strong>: primeros puestos entre partidas jugadas.</li>
          <li>
            <strong>Puntos</strong>: cada puesto da puntos (por defecto 3, 2 y 1 para 1.º, 2.º y 3.º). Los
            administradores pueden cambiarlos en Configuración.
          </li>
        </ul>

        <h2>Sesiones y studios</h2>
        <ul>
          <li>
            Una sesión agrupa las partidas de un día. Mientras es un borrador no cuenta; al subirla, sus
            partidas entran al ranking.
          </li>
          <li>
            Cada jugador pertenece a un studio: Product, Movement, Understanding, Operaciones o Externo.
          </li>
          <li>
            El gráfico de <strong>Studios</strong> suma las partidas ganadas por los jugadores de cada studio.
            Los externos no entran en el gráfico.
          </li>
          <li>
            La etiqueta <strong>MVP</strong> marca al jugador de cada studio que más partidas ganó en los
            últimos {MVP_DAYS} días. Si hay empate, la llevan todos los empatados.
          </li>
        </ul>
      </article>
    </main>
  );
}
