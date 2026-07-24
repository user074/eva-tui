use std::cmp::Ordering;

use ratatui::{
    buffer::Buffer,
    layout::Rect,
    style::{Color, Modifier, Style},
    widgets::Widget,
};

use crate::palette::BLACK;

const EDGE_EPSILON: f32 = 0.000_1;

/// A point in widget-local normalized coordinates.
///
/// EVA source geometry is recorded as ratios, so keeping polygon vertices in
/// the `0.0..=1.0` range lets the same shape respond to terminal resizing
/// without first rasterizing it into an image.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CellPoint {
    pub x: f32,
    pub y: f32,
}

impl CellPoint {
    pub const fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }
}

/// A high-contrast EVA instrument plate built entirely from rectangular cells.
///
/// The background color carries the silhouette, while the inset horizontal
/// rails add structure without relying on corners or diagonal glyphs.
#[derive(Debug, Clone, Copy)]
pub struct FilledRectPanel {
    tone: Color,
    rail: Color,
    rail_inset: u16,
}

impl FilledRectPanel {
    pub const fn new(tone: Color, rail: Color) -> Self {
        Self {
            tone,
            rail,
            rail_inset: 3,
        }
    }

    pub const fn rail_inset(mut self, rail_inset: u16) -> Self {
        self.rail_inset = rail_inset;
        self
    }
}

impl Widget for FilledRectPanel {
    fn render(self, area: Rect, buffer: &mut Buffer) {
        if area.width == 0 || area.height == 0 {
            return;
        }

        for y in area.y..area.bottom() {
            fill_span(buffer, area.x, area.right().saturating_sub(1), y, self.tone);
        }

        if area.width < 5 || area.height < 2 {
            return;
        }

        let maximum_inset = area.width.saturating_sub(3) / 2;
        let inset = self.rail_inset.min(maximum_inset);
        let left = area.x.saturating_add(inset);
        let right = area.right().saturating_sub(inset + 1);
        for y in [area.y, area.bottom().saturating_sub(1)] {
            for x in left..=right {
                set_cell(
                    buffer,
                    x,
                    y,
                    "━",
                    Style::default()
                        .fg(self.rail)
                        .bg(self.tone)
                        .add_modifier(Modifier::BOLD),
                );
            }
        }
    }
}

/// A compact rectangular station indicator with a solid contrasting index tab.
#[derive(Debug, Clone, Copy)]
pub struct StationBlock {
    direction: i8,
    tone: Color,
    accent: Color,
    accent_width_ratio: f32,
}

impl StationBlock {
    pub const fn new(direction: i8, tone: Color, accent: Color, accent_width_ratio: f32) -> Self {
        Self {
            direction,
            tone,
            accent,
            accent_width_ratio,
        }
    }
}

impl Widget for StationBlock {
    fn render(self, area: Rect, buffer: &mut Buffer) {
        if area.width == 0 || area.height == 0 {
            return;
        }

        for y in area.y..area.bottom() {
            fill_span(buffer, area.x, area.right().saturating_sub(1), y, self.tone);
        }

        let accent_width = ((f32::from(area.width) * self.accent_width_ratio).round() as u16)
            .max(1)
            .min(area.width);
        let (accent_left, accent_right) = if self.direction < 0 {
            (
                area.x,
                area.x.saturating_add(accent_width).saturating_sub(1),
            )
        } else {
            (
                area.right().saturating_sub(accent_width),
                area.right().saturating_sub(1),
            )
        };
        for y in area.y..area.bottom() {
            fill_span(buffer, accent_left, accent_right, y, self.accent);
        }

        if area.width >= 4 {
            let rail_left = if self.direction < 0 {
                accent_right.saturating_add(1)
            } else {
                area.x
            };
            let rail_right = if self.direction < 0 {
                area.right().saturating_sub(1)
            } else {
                accent_left.saturating_sub(1)
            };
            for x in rail_left..=rail_right {
                set_cell(
                    buffer,
                    x,
                    area.y,
                    "━",
                    Style::default()
                        .fg(BLACK)
                        .bg(self.tone)
                        .add_modifier(Modifier::BOLD),
                );
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct ScanlineHit {
    x: f32,
    slope: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct ScanlineSpan {
    left: f32,
    right: f32,
    left_slope: f32,
    right_slope: f32,
}

/// A filled convex polygon rendered directly into Ratatui terminal cells.
///
/// Every painted cell is a background-colored space by default. This keeps the
/// silhouette independent of font glyph metrics; diagonal masks are available
/// only as an explicit opt-in for small decorative elements.
#[derive(Debug, Clone, Copy)]
pub struct ConvexPolygonPanel<'a> {
    points: &'a [CellPoint],
    fill: Color,
    edge_masks: bool,
}

impl<'a> ConvexPolygonPanel<'a> {
    pub const fn new(points: &'a [CellPoint], fill: Color) -> Self {
        Self {
            points,
            fill,
            edge_masks: false,
        }
    }

    pub const fn edge_masks(mut self, edge_masks: bool) -> Self {
        self.edge_masks = edge_masks;
        self
    }
}

impl Widget for ConvexPolygonPanel<'_> {
    fn render(self, area: Rect, buffer: &mut Buffer) {
        render_convex_polygon(buffer, area, self.points, self.fill, self.edge_masks);
    }
}

/// A solid six-sided panel using a source-derived cap ratio.
#[derive(Debug, Clone, Copy)]
pub struct HexPanel {
    cap_ratio: f32,
    fill: Color,
}

impl HexPanel {
    pub const fn new(cap_ratio: f32, fill: Color) -> Self {
        Self { cap_ratio, fill }
    }

    fn points(self) -> [CellPoint; 6] {
        hex_points(self.cap_ratio)
    }
}

impl Widget for HexPanel {
    fn render(self, area: Rect, buffer: &mut Buffer) {
        let points = self.points();
        ConvexPolygonPanel::new(&points, self.fill)
            .edge_masks(false)
            .render(area, buffer);
    }
}

/// A filled hexagonal panel with the optically scaled black inset seam used by
/// the EWS source assets.
#[derive(Debug, Clone, Copy)]
pub struct LayeredHexPanel {
    cap_ratio: f32,
    tone: Color,
}

impl LayeredHexPanel {
    pub const fn new(cap_ratio: f32, tone: Color) -> Self {
        Self { cap_ratio, tone }
    }
}

impl Widget for LayeredHexPanel {
    fn render(self, area: Rect, buffer: &mut Buffer) {
        let points = hex_points(self.cap_ratio);
        ConvexPolygonPanel::new(&points, self.tone)
            .edge_masks(false)
            .render(area, buffer);
        render_inset_seam(buffer, area, &points, self.tone, BLACK);
    }
}

/// A hollow hexagonal warning marker that leaves its center untouched.
#[derive(Debug, Clone, Copy)]
pub struct OutlineHexPanel {
    cap_ratio: f32,
    tone: Color,
}

impl OutlineHexPanel {
    pub const fn new(cap_ratio: f32, tone: Color) -> Self {
        Self { cap_ratio, tone }
    }
}

impl Widget for OutlineHexPanel {
    fn render(self, area: Rect, buffer: &mut Buffer) {
        let points = hex_points(self.cap_ratio);
        render_convex_outline(buffer, area, &points, self.tone);
    }
}

/// A one-row station polygon translated from the EWS skew-rectangle assets.
#[derive(Debug, Clone, Copy)]
pub struct StationBlade {
    direction: i8,
    tone: Color,
    accent: Color,
    skew_ratio: f32,
    accent_width_ratio: f32,
}

impl StationBlade {
    pub const fn new(
        direction: i8,
        tone: Color,
        accent: Color,
        skew_ratio: f32,
        accent_width_ratio: f32,
    ) -> Self {
        Self {
            direction,
            tone,
            accent,
            skew_ratio,
            accent_width_ratio,
        }
    }
}

impl Widget for StationBlade {
    fn render(self, area: Rect, buffer: &mut Buffer) {
        if area.width < 4 || area.height == 0 {
            return;
        }

        let y = area.y;
        let left = area.x;
        let right = area.right().saturating_sub(1);
        let left_outside = background_at(buffer, left, y);
        let right_outside = background_at(buffer, right, y);
        let left_cutout = if self.direction < 0 { "◤" } else { "◣" };
        let right_cutout = if self.direction < 0 { "◢" } else { "◥" };

        set_cell(
            buffer,
            left,
            y,
            left_cutout,
            Style::default().fg(left_outside).bg(self.tone),
        );
        fill_span(
            buffer,
            left.saturating_add(1),
            right.saturating_sub(1),
            y,
            self.tone,
        );
        set_cell(
            buffer,
            right,
            y,
            right_cutout,
            Style::default().fg(right_outside).bg(self.tone),
        );

        let skew_columns = ((f32::from(area.width) * self.skew_ratio).round() as u16)
            .max(1)
            .min(area.width.saturating_sub(2));
        let accent_width = ((f32::from(area.width) * self.accent_width_ratio).round() as u16)
            .max(1)
            .min(area.width.saturating_sub(2));
        let accent_start = if self.direction < 0 {
            left.saturating_add(skew_columns)
        } else {
            left.saturating_add(1)
        };
        let accent_end = accent_start.saturating_add(accent_width).min(right);
        for x in accent_start..accent_end {
            set_cell(
                buffer,
                x,
                y,
                "━",
                Style::default()
                    .fg(self.accent)
                    .bg(self.tone)
                    .add_modifier(Modifier::BOLD),
            );
        }
    }
}

fn hex_points(cap_ratio: f32) -> [CellPoint; 6] {
    let cap = cap_ratio.clamp(0.0, 0.5);
    [
        CellPoint::new(cap, 0.0),
        CellPoint::new(1.0 - cap, 0.0),
        CellPoint::new(1.0, 0.5),
        CellPoint::new(1.0 - cap, 1.0),
        CellPoint::new(cap, 1.0),
        CellPoint::new(0.0, 0.5),
    ]
}

fn render_convex_polygon(
    buffer: &mut Buffer,
    area: Rect,
    points: &[CellPoint],
    fill: Color,
    edge_masks: bool,
) {
    if area.width == 0 || area.height == 0 || points.len() < 3 {
        return;
    }

    for row in 0..area.height {
        let normalized_y = normalized_row(row, area.height);
        let Some(span) = scanline_span(points, normalized_y) else {
            continue;
        };
        let (left, right) = cell_span(area, span);
        let y = area.y.saturating_add(row);
        if y >= buffer.area.bottom() || right < left {
            continue;
        }

        let left_outside = background_at(buffer, left, y);
        let right_outside = background_at(buffer, right, y);
        fill_span(buffer, left, right, y, fill);

        if edge_masks && left < right {
            paint_left_edge(buffer, left, y, span.left_slope, left_outside, fill);
            paint_right_edge(buffer, right, y, span.right_slope, right_outside, fill);
        }
    }
}

fn render_convex_outline(buffer: &mut Buffer, area: Rect, points: &[CellPoint], tone: Color) {
    if area.width == 0 || area.height == 0 || points.len() < 3 {
        return;
    }

    for row in 0..area.height {
        let normalized_y = normalized_row(row, area.height);
        let Some(span) = scanline_span(points, normalized_y) else {
            continue;
        };
        let (left, right) = cell_span(area, span);
        let y = area.y.saturating_add(row);
        if y >= buffer.area.bottom() || right < left {
            continue;
        }

        if row == 0 || row + 1 == area.height {
            for x in left.saturating_add(1)..right {
                set_cell(buffer, x, y, "━", Style::default().fg(tone));
            }
        }

        paint_solid_outline_edge(buffer, left, y, tone);
        if right > left {
            paint_solid_outline_edge(buffer, right, y, tone);
        }
    }
}

fn render_inset_seam(
    buffer: &mut Buffer,
    area: Rect,
    points: &[CellPoint],
    fill: Color,
    seam: Color,
) {
    if area.width < 4 || area.height < 2 {
        return;
    }

    for row in [0, area.height.saturating_sub(1)] {
        let normalized_y = normalized_row(row, area.height);
        let Some(span) = scanline_span(points, normalized_y) else {
            continue;
        };
        let (left, right) = cell_span(area, span);
        let y = area.y.saturating_add(row);
        for x in left.saturating_add(1)..right {
            set_cell(buffer, x, y, "━", Style::default().fg(seam).bg(fill));
        }
    }
}

fn scanline_span(points: &[CellPoint], y: f32) -> Option<ScanlineSpan> {
    let mut hits = Vec::with_capacity(points.len());
    for index in 0..points.len() {
        let start = points[index];
        let end = points[(index + 1) % points.len()];
        let delta_y = end.y - start.y;
        if delta_y.abs() <= EDGE_EPSILON {
            continue;
        }
        let min_y = start.y.min(end.y);
        let max_y = start.y.max(end.y);
        if y < min_y - EDGE_EPSILON || y > max_y + EDGE_EPSILON {
            continue;
        }

        let progress = (y - start.y) / delta_y;
        if !(-EDGE_EPSILON..=1.0 + EDGE_EPSILON).contains(&progress) {
            continue;
        }
        hits.push(ScanlineHit {
            x: start.x + (end.x - start.x) * progress,
            slope: (end.x - start.x) / delta_y,
        });
    }

    hits.sort_by(|left, right| left.x.partial_cmp(&right.x).unwrap_or(Ordering::Equal));
    let first = *hits.first()?;
    let last = *hits.last()?;
    let left_slope = merged_extreme_slope(&hits, first.x);
    let right_slope = merged_extreme_slope(&hits, last.x);
    Some(ScanlineSpan {
        left: first.x,
        right: last.x,
        left_slope,
        right_slope,
    })
}

fn merged_extreme_slope(hits: &[ScanlineHit], x: f32) -> f32 {
    let mut slopes = hits
        .iter()
        .filter(|hit| (hit.x - x).abs() <= EDGE_EPSILON)
        .map(|hit| hit.slope);
    let Some(first) = slopes.next() else {
        return 0.0;
    };
    let mut sum = first;
    let mut count = 1_u16;
    for slope in slopes {
        if slope.signum() != first.signum() {
            return 0.0;
        }
        sum += slope;
        count += 1;
    }
    sum / f32::from(count)
}

fn normalized_row(row: u16, height: u16) -> f32 {
    if height <= 1 {
        0.5
    } else {
        f32::from(row) / f32::from(height - 1)
    }
}

fn cell_span(area: Rect, span: ScanlineSpan) -> (u16, u16) {
    let width = f32::from(area.width.saturating_sub(1));
    let left_offset = (span.left.clamp(0.0, 1.0) * width).round() as u16;
    let right_offset = (span.right.clamp(0.0, 1.0) * width).round() as u16;
    (
        area.x.saturating_add(left_offset),
        area.x.saturating_add(right_offset),
    )
}

fn paint_left_edge(buffer: &mut Buffer, x: u16, y: u16, slope: f32, outside: Color, fill: Color) {
    let symbol = if slope < -EDGE_EPSILON {
        Some("◤")
    } else if slope > EDGE_EPSILON {
        Some("◣")
    } else {
        None
    };
    if let Some(symbol) = symbol {
        set_cell(
            buffer,
            x,
            y,
            symbol,
            Style::default()
                .fg(outside)
                .bg(fill)
                .add_modifier(Modifier::BOLD),
        );
    }
}

fn paint_right_edge(buffer: &mut Buffer, x: u16, y: u16, slope: f32, outside: Color, fill: Color) {
    let symbol = if slope > EDGE_EPSILON {
        Some("◥")
    } else if slope < -EDGE_EPSILON {
        Some("◢")
    } else {
        None
    };
    if let Some(symbol) = symbol {
        set_cell(
            buffer,
            x,
            y,
            symbol,
            Style::default()
                .fg(outside)
                .bg(fill)
                .add_modifier(Modifier::BOLD),
        );
    }
}

fn paint_solid_outline_edge(buffer: &mut Buffer, x: u16, y: u16, tone: Color) {
    set_cell(buffer, x, y, " ", Style::default().fg(tone).bg(tone));
}

fn fill_span(buffer: &mut Buffer, left: u16, right: u16, y: u16, fill: Color) {
    if y < buffer.area.y || y >= buffer.area.bottom() || right < left {
        return;
    }
    let left = left.max(buffer.area.x);
    let right = right.min(buffer.area.right().saturating_sub(1));
    for x in left..=right {
        set_cell(buffer, x, y, " ", Style::default().fg(fill).bg(fill));
    }
}

fn background_at(buffer: &Buffer, x: u16, y: u16) -> Color {
    if x < buffer.area.x
        || x >= buffer.area.right()
        || y < buffer.area.y
        || y >= buffer.area.bottom()
    {
        BLACK
    } else {
        buffer[(x, y)].bg
    }
}

fn set_cell(buffer: &mut Buffer, x: u16, y: u16, symbol: &str, style: Style) {
    if x < buffer.area.x
        || x >= buffer.area.right()
        || y < buffer.area.y
        || y >= buffer.area.bottom()
    {
        return;
    }
    buffer[(x, y)].set_symbol(symbol).set_style(style);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_scanlines_follow_source_cap_and_meet_at_full_width() {
        let points = hex_points(0.25);
        let top = scanline_span(&points, 0.0).expect("top span");
        let middle = scanline_span(&points, 0.5).expect("middle span");
        let bottom = scanline_span(&points, 1.0).expect("bottom span");

        assert!((top.left - 0.25).abs() < EDGE_EPSILON);
        assert!((top.right - 0.75).abs() < EDGE_EPSILON);
        assert!((middle.left - 0.0).abs() < EDGE_EPSILON);
        assert!((middle.right - 1.0).abs() < EDGE_EPSILON);
        assert!((bottom.left - 0.25).abs() < EDGE_EPSILON);
        assert!((bottom.right - 0.75).abs() < EDGE_EPSILON);
        assert_eq!(middle.left_slope, 0.0);
        assert_eq!(middle.right_slope, 0.0);
    }

    #[test]
    fn filled_hex_uses_symmetric_background_spans() {
        let area = Rect::new(0, 0, 17, 7);
        let mut buffer = Buffer::empty(area);
        buffer.set_style(area, Style::default().fg(BLACK).bg(BLACK));

        HexPanel::new(0.25, Color::Red).render(area, &mut buffer);

        let widths = (0..area.height)
            .map(|y| {
                (0..area.width)
                    .filter(|x| buffer[(*x, y)].bg == Color::Red)
                    .count()
            })
            .collect::<Vec<_>>();
        assert_eq!(widths, vec![9, 11, 15, 17, 15, 11, 9]);
        assert!(buffer
            .content()
            .iter()
            .filter(|cell| cell.bg == Color::Red)
            .all(|cell| cell.symbol() == " "));
    }

    #[test]
    fn outline_hex_preserves_black_center() {
        let area = Rect::new(0, 0, 17, 7);
        let mut buffer = Buffer::empty(area);
        buffer.set_style(area, Style::default().fg(BLACK).bg(BLACK));

        OutlineHexPanel::new(0.25, Color::Red).render(area, &mut buffer);

        assert_eq!(buffer[(8, 3)].bg, BLACK);
        assert_eq!(buffer[(0, 3)].bg, Color::Red);
        assert_eq!(buffer[(8, 0)].fg, Color::Red);
        assert_eq!(buffer[(8, 6)].fg, Color::Red);
    }

    #[test]
    fn layered_hex_adds_black_seam_over_solid_fill() {
        let area = Rect::new(0, 0, 17, 7);
        let mut buffer = Buffer::empty(area);
        buffer.set_style(area, Style::default().fg(BLACK).bg(BLACK));

        LayeredHexPanel::new(0.25, Color::Red).render(area, &mut buffer);

        assert_eq!(buffer[(8, 0)].symbol(), "━");
        assert_eq!(buffer[(8, 0)].fg, BLACK);
        assert_eq!(buffer[(8, 0)].bg, Color::Red);
        assert_eq!(buffer[(8, 3)].bg, Color::Red);
    }

    #[test]
    fn filled_rect_panel_keeps_a_gapless_background() {
        let area = Rect::new(0, 0, 17, 5);
        let mut buffer = Buffer::empty(area);
        buffer.set_style(area, Style::default().fg(BLACK).bg(BLACK));

        FilledRectPanel::new(Color::Red, BLACK)
            .rail_inset(3)
            .render(area, &mut buffer);

        assert!(buffer.content().iter().all(|cell| cell.bg == Color::Red));
        assert_eq!(buffer[(0, 0)].symbol(), " ");
        assert_eq!(buffer[(3, 0)].symbol(), "━");
        assert_eq!(buffer[(8, 2)].symbol(), " ");
    }

    #[test]
    fn station_block_uses_rectangular_background_tabs() {
        let area = Rect::new(0, 0, 10, 2);
        let mut buffer = Buffer::empty(area);
        buffer.set_style(area, Style::default().fg(BLACK).bg(BLACK));

        StationBlock::new(-1, Color::Green, Color::Yellow, 0.3).render(area, &mut buffer);

        assert_eq!(buffer[(0, 1)].bg, Color::Yellow);
        assert_eq!(buffer[(2, 1)].bg, Color::Yellow);
        assert_eq!(buffer[(3, 1)].bg, Color::Green);
        assert!(!buffer
            .content()
            .iter()
            .any(|cell| { matches!(cell.symbol(), "◤" | "◥" | "◣" | "◢") }));
    }
}
