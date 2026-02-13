import { test, expect, describe } from "bun:test";
import { normalizeDataset } from "./normalize";
import { adaptCartesian, adaptNameValue, adaptSankey } from "./adapters";

describe("Data Layer", () => {
  test("normalizeDataset should handle empty input", () => {
    const ds = normalizeDataset({});
    expect(ds.id).toBe("default");
    expect(ds.rows).toEqual([]);
    expect(ds.dimensions).toEqual([]);
  });

  test("adaptCartesian should map fields correctly", () => {
    const rows = [
      { month: "Jan", sales: 100, profit: 20 },
      { month: "Feb", sales: "120", profit: 25 },
    ];
    const result = adaptCartesian(rows, "month", ["sales", "profit"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ month: "Jan", sales: 100, profit: 20 });
    expect(result[1]).toEqual({ month: "Feb", sales: 120, profit: 25 });
  });

  test("adaptNameValue should handle pie data", () => {
    const rows = [
      { category: "A", value: 10 },
      { category: "B", value: 20 },
    ];
    const result = adaptNameValue(rows, "category", "value");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("A");
    expect(result[0].value).toBe(10);
    expect(result[0].fill).toBe("var(--chart-1)");
  });

  test("adaptSankey should generate nodes and links", () => {
    const rows = [
      { from: "A", to: "B", amount: 100 },
      { from: "B", to: "C", amount: 50 },
    ];
    const result = adaptSankey(rows, "from", "to", "amount");
    expect(result.nodes).toHaveLength(3); // A, B, C
    expect(result.links).toHaveLength(2);
    expect(result.links[0]).toEqual({ source: 0, target: 1, value: 100 });
  });
});
