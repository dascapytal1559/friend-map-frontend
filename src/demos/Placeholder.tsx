// A stand-in for a demo that isn't built yet, and the smallest example of a
// view: everyone as a dot on a spiral (most messages in the middle), sized by
// messages and coloured by friend group, with the hover card and the person
// panel wired up. Each demo's own file replaces it with the real thing.

import { max, scaleSqrt } from "d3";
import { useMemo, useState } from "react";
import { monthLabel, standing, type DemoPerson } from "./model.ts";
import { communityColor } from "./palette.ts";
import { basicRows, Legend, Swatch, tipAt, topIds, type ViewProps } from "./view.tsx";

export function Placeholder({ model, width, height, inset, hover, open, title }: ViewProps & { title: string }) {
  const [focus, setFocus] = useState<DemoPerson | null>(null);
  const now = model.months.length - 1;
  const people = useMemo(() => [...model.people].sort((a, b) => b.total - a.total), [model]);
  const size = scaleSqrt().domain([0, max(people, (p) => p.total) || 1]).range([2, 11]);
  const cx = width / 2;
  const cy = inset + (height - inset) / 2;
  const spacing = Math.min(width, height - inset) / 2 / Math.sqrt(Math.max(1, people.length)) * 0.85;
  const named = topIds(people, (p) => p.total, 8);

  return (
    <>
      <svg width={width} height={height}>
        {people.map((person, i) => {
          const angle = i * 2.39996;
          const r = spacing * Math.sqrt(i + 4);
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          return (
            <g
              key={person.id}
              className="demo-person"
              onMouseMove={(event) => {
                setFocus(person);
                hover(tipAt(event, person, basicRows(person, standing(person, now, model))));
              }}
              onMouseLeave={() => {
                setFocus(null);
                hover(null);
              }}
              onClick={() => open(person)}
            >
              <circle cx={x} cy={y} r={size(person.total)} fill={communityColor(person.community)}
                fillOpacity={focus && focus.id !== person.id ? 0.35 : 0.9} stroke={focus?.id === person.id ? "#fff" : "none"} />
              {named.has(person.id) && <text className="demo-label" x={x} y={y - size(person.total) - 4} textAnchor="middle">{person.name}</text>}
            </g>
          );
        })}
      </svg>
      <div className="demo-placeholder">
        <strong>{title}</strong>
        <span>Coming soon. Meanwhile, everyone it will draw:</span>
        <span>
          {model.people.length} people · {model.groups.length} group chats · {monthLabel(model.months[0])} to {monthLabel(model.months[now])}
        </span>
      </div>
      <Legend>
        <div><Swatch color={communityColor(0)} /><Swatch color={communityColor(1)} /><Swatch color={communityColor(2)} /> friend group, from shared chats</div>
        <div><Swatch color={communityColor(-1)} /> no shared group chats</div>
      </Legend>
    </>
  );
}
