// Violations: a hex literal, a Tailwind arbitrary colour and an rgb() string.
export function RawColours() {
  const shadow = "0 1px 2px rgb(0 0 0 / 0.2)";
  return (
    <div style={{ color: "#5342CC", boxShadow: shadow }} className="bg-[#fff]">
      Raw colours
    </div>
  );
}
