import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const API = import.meta.env.VITE_API_URL || "";

export default function Weakness({ userId }) {
  const [data, setData] = useState([]);
  useEffect(() => {
    fetch(`${API}/api/analytics/student/${userId}`)
      .then((r) => r.json())
      .then((rows) =>
        setData(rows.map((d) => ({ name: d.sub_skill || d.skill, misses: d.misses })))
      )
      .catch(() => setData([]));
  }, [userId]);

  return (
    <div style={{ width: "100%", height: 320 }}>
      <h3>Your most frequent mistakes</h3>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 60 }}>
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={120} />
          <Tooltip />
          <Bar dataKey="misses" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
