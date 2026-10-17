// Hong Kong monthly temperature heatmap, drawn with D3.
// Columns are years, rows are months, and each cell's color is a temperature.
// Level 1: all years. Level 2: last 10 years, with a mini line chart of daily temps in each cell.

// Settings
const margin = { top: 40, right: 120, bottom: 20, left: 80 }; // space around the grid for axes and legend
const legendHeight = 300;
const yearsToShow = 10; // Level 2 only shows the last 10 years
const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Load the CSV once (columns: date, max_temperature, min_temperature), then draw both levels.
d3.csv("temperature_daily.csv").then((rows) => {
  // Level 1: every year, small cells
  drawHeatmap({
    chartId: "#chart",
    controlsId: "#controls",
    monthly: groupByMonth(rows),
    cellWidth: 40,
    cellHeight: 30,
    showMiniCharts: false,
  });

  // Level 2: last 10 years, bigger cells with mini line charts
  const lastYear = d3.max(rows, getYear);
  const recentRows = rows.filter((row) => getYear(row) > lastYear - yearsToShow);
  drawHeatmap({
    chartId: "#chart2",
    controlsId: "#controls2",
    monthly: groupByMonth(recentRows),
    cellWidth: 80,
    cellHeight: 60,
    showMiniCharts: true,
  });
});

// "2008-01-15" -> 2008
function getYear(row) {
  return Number(row.date.slice(0, 4));
}

// Turn daily rows into one record per month: { year, month, max, min, days }.
// max = highest daily max, min = lowest daily min, days = the daily values (for the mini lines).
function groupByMonth(rows) {
  const monthly = [];
  for (const row of rows) {
    const year = getYear(row);
    const month = Number(row.date.slice(5, 7)) - 1; // "2008-01-15" -> 0 (January)
    const day = Number(row.date.slice(8, 10)); // "2008-01-15" -> 15
    const max = Number(row.max_temperature);
    const min = Number(row.min_temperature);

    // Find this month's record, or start a new one if it's the first day we've seen.
    let record = monthly.find((d) => d.year === year && d.month === month);
    if (!record) {
      record = { year, month, max, min, days: [] };
      monthly.push(record);
    }
    record.max = Math.max(record.max, max);
    record.min = Math.min(record.min, min);
    record.days.push({ day, max, min });
  }
  return monthly;
}

// Draws one full heatmap: SVG, axes, cells, optional mini charts, tooltip, legend and toggle button.
function drawHeatmap({ chartId, controlsId, monthly, cellWidth, cellHeight, showMiniCharts }) {
  const years = [...new Set(monthly.map((d) => d.year))];
  const width = years.length * cellWidth;
  const height = months.length * cellHeight;

  // "svg" is a group shifted by the margins, so the grid starts at (0, 0).
  const svg = d3
    .select(chartId)
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // Scales: turn years and months into pixel positions.
  const x = d3.scaleBand().domain(years).range([0, width]).padding(0.1);
  const y = d3.scaleBand().domain(months).range([0, height]).padding(0.1);

  // Color scale: temperature -> color.
  // One range for both max and min, so a color means the same temperature in both views.
  const lowest = d3.min(monthly, (d) => d.min);
  const highest = d3.max(monthly, (d) => d.max);
  const color = d3.scaleSequential(d3.interpolateYlOrRd).domain([lowest, highest]);

  // Axes: years on top, months on the left.
  svg.append("g").call(d3.axisTop(x));
  svg.append("g").call(d3.axisLeft(y));

  const cells = drawCells(svg, monthly, x, y);
  if (showMiniCharts) drawMiniCharts(svg, monthly, x, y, lowest, highest);
  addTooltip(cells);
  const legendTitle = drawLegend(svg, width, color, lowest, highest);
  addToggle(controlsId, cells, color, legendTitle);
}

// One rectangle per month, placed by year (column) and month (row).
// Each rect gets its month's record attached, which the tooltip and colors read later.
function drawCells(svg, monthly, x, y) {
  return svg
    .selectAll(".cell")
    .data(monthly)
    .join("rect")
    .attr("class", "cell")
    .attr("x", (d) => x(d.year))
    .attr("y", (d) => y(months[d.month]))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth());
}

// A small line chart of the daily max and min inside each cell.
function drawMiniCharts(svg, monthly, x, y, lowest, highest) {
  // Scales for inside one cell: day of the month -> left to right, temperature -> bottom to top.
  // Every cell uses the same temperature range, so lines can be compared across cells.
  const dayX = d3.scaleLinear().domain([1, 31]).range([0, x.bandwidth()]);
  const tempY = d3.scaleLinear().domain([lowest, highest]).range([y.bandwidth(), 0]);

  // Line generators: turn a month's list of days into an SVG path string.
  const maxLine = d3.line().x((d) => dayX(d.day)).y((d) => tempY(d.max));
  const minLine = d3.line().x((d) => dayX(d.day)).y((d) => tempY(d.min));

  // One group per cell, moved to that cell's top-left corner.
  // Inside the group, (0, 0) is the cell's corner, so the lines are drawn in cell coordinates.
  const miniCharts = svg
    .selectAll(".mini-chart")
    .data(monthly)
    .join("g")
    .attr("class", "mini-chart")
    .attr("transform", (d) => `translate(${x(d.year)}, ${y(months[d.month])})`);

  miniCharts.append("path").attr("class", "max-line").attr("d", (d) => maxLine(d.days));
  miniCharts.append("path").attr("class", "min-line").attr("d", (d) => minLine(d.days));
}

// Show the month and temperatures next to the mouse while hovering a cell.
function addTooltip(cells) {
  const tooltip = d3.select("#tooltip");
  cells
    // Mouse enters a cell: fill in that cell's data and show the tooltip.
    .on("mouseover", (event, d) => {
      tooltip
        .style("opacity", 1)
        .html(`${months[d.month]} ${d.year}<br>Max: ${d.max}°C<br>Min: ${d.min}°C`);
    })
    // Mouse moves: keep the tooltip just below and to the right of the cursor.
    .on("mousemove", (event) => {
      tooltip.style("left", event.pageX + 12 + "px").style("top", event.pageY + 12 + "px");
    })
    // Mouse leaves: hide it.
    .on("mouseout", () => tooltip.style("opacity", 0));
}

// A color bar to the right of the grid. Returns its title so the toggle can update it.
function drawLegend(svg, width, color, lowest, highest) {
  const legend = svg.append("g").attr("transform", `translate(${width + 30}, 0)`);
  const legendScale = d3.scaleLinear().domain([lowest, highest]).range([legendHeight, 0]);

  // Draw the bar as a stack of 1-pixel-tall stripes.
  // legendScale.invert() turns a pixel position back into a temperature.
  for (let i = 0; i < legendHeight; i++) {
    legend
      .append("rect")
      .attr("y", i)
      .attr("width", 20)
      .attr("height", 1)
      .attr("fill", color(legendScale.invert(i)));
  }

  // Temperature labels on the right side of the bar.
  legend
    .append("g")
    .attr("transform", "translate(20, 0)")
    .call(d3.axisRight(legendScale).tickFormat((t) => t + "°C"));

  return legend.append("text").attr("class", "legend-title").attr("y", -10);
}

// A button that switches the cell colors between max and min temperature.
function addToggle(controlsId, cells, color, legendTitle) {
  let showing = "max"; // "max" or "min"
  const button = d3.select(controlsId).append("button").attr("class", "mode-toggle");

  // Recolor the cells and update the button and legend text.
  function updateColors() {
    cells.transition().duration(500).attr("fill", (d) => color(d[showing]));
    button.text(`Showing ${showing} temperature (click to switch)`);
    legendTitle.text(`${showing} temp`);
  }

  button.on("click", () => {
    showing = showing === "max" ? "min" : "max";
    updateColors();
  });

  updateColors(); // set the starting colors
}
