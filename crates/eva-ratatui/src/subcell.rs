use ratatui::{
    buffer::Buffer,
    layout::Rect,
    style::{Color, Style},
    widgets::Widget,
};

/// A terminal raster surface with a 2×2 sub-cell grid.
///
/// Full cells are emitted as background-colored spaces. Boundary cells use a
/// single Unicode quadrant family, so diagonal edges do not depend on unrelated
/// glyphs such as `◢` and `▄` meeting perfectly in the selected terminal font.
#[derive(Debug, Clone)]
pub struct SubcellSurface {
    width: u16,
    height: u16,
    background: Color,
    pixels: Vec<Option<Color>>,
}

impl SubcellSurface {
    pub fn new(width: u16, height: u16, background: Color) -> Self {
        let pixel_count = usize::from(width) * usize::from(height) * 4;
        Self {
            width,
            height,
            background,
            pixels: vec![None; pixel_count],
        }
    }

    pub fn fill_polygon(&mut self, points: &[(f32, f32)], color: Color) {
        if points.len() < 3 {
            return;
        }

        let min_x = points
            .iter()
            .map(|point| point.0)
            .fold(f32::INFINITY, f32::min);
        let max_x = points
            .iter()
            .map(|point| point.0)
            .fold(f32::NEG_INFINITY, f32::max);
        let min_y = points
            .iter()
            .map(|point| point.1)
            .fold(f32::INFINITY, f32::min);
        let max_y = points
            .iter()
            .map(|point| point.1)
            .fold(f32::NEG_INFINITY, f32::max);

        let start_x = ((min_x * 2.0).floor() as i32).max(0);
        let end_x = ((max_x * 2.0).ceil() as i32).min(i32::from(self.width) * 2);
        let start_y = ((min_y * 2.0).floor() as i32).max(0);
        let end_y = ((max_y * 2.0).ceil() as i32).min(i32::from(self.height) * 2);

        for pixel_y in start_y..end_y {
            for pixel_x in start_x..end_x {
                let sample = ((pixel_x as f32 + 0.5) / 2.0, (pixel_y as f32 + 0.5) / 2.0);
                if point_in_polygon(sample, points) {
                    self.set_pixel(pixel_x, pixel_y, color);
                }
            }
        }
    }

    pub fn fill_rect(&mut self, x: f32, y: f32, width: f32, height: f32, color: Color) {
        self.fill_polygon(
            &[
                (x, y),
                (x + width, y),
                (x + width, y + height),
                (x, y + height),
            ],
            color,
        );
    }

    pub fn stroke_line(
        &mut self,
        start: (f32, f32),
        end: (f32, f32),
        thickness: f32,
        color: Color,
    ) {
        let radius = thickness.max(0.25) / 2.0;
        let min_x = (start.0.min(end.0) - radius).max(0.0);
        let max_x = (start.0.max(end.0) + radius).min(f32::from(self.width));
        let min_y = (start.1.min(end.1) - radius).max(0.0);
        let max_y = (start.1.max(end.1) + radius).min(f32::from(self.height));

        let start_pixel_x = (min_x * 2.0).floor() as i32;
        let end_pixel_x = (max_x * 2.0).ceil() as i32;
        let start_pixel_y = (min_y * 2.0).floor() as i32;
        let end_pixel_y = (max_y * 2.0).ceil() as i32;

        for pixel_y in start_pixel_y..end_pixel_y {
            for pixel_x in start_pixel_x..end_pixel_x {
                let sample = ((pixel_x as f32 + 0.5) / 2.0, (pixel_y as f32 + 0.5) / 2.0);
                if distance_to_segment(sample, start, end) <= radius {
                    self.set_pixel(pixel_x, pixel_y, color);
                }
            }
        }
    }

    fn set_pixel(&mut self, pixel_x: i32, pixel_y: i32, color: Color) {
        if pixel_x < 0
            || pixel_y < 0
            || pixel_x >= i32::from(self.width) * 2
            || pixel_y >= i32::from(self.height) * 2
        {
            return;
        }
        let pixel_width = usize::from(self.width) * 2;
        let index = pixel_y as usize * pixel_width + pixel_x as usize;
        if let Some(pixel) = self.pixels.get_mut(index) {
            *pixel = Some(color);
        }
    }

    fn pixel(&self, pixel_x: usize, pixel_y: usize) -> Option<Color> {
        let pixel_width = usize::from(self.width) * 2;
        self.pixels
            .get(pixel_y * pixel_width + pixel_x)
            .copied()
            .flatten()
    }

    fn resolved_cell(&self, x: usize, y: usize) -> ResolvedCell {
        let colors = [
            self.pixel(x * 2, y * 2).unwrap_or(self.background),
            self.pixel(x * 2 + 1, y * 2).unwrap_or(self.background),
            self.pixel(x * 2, y * 2 + 1).unwrap_or(self.background),
            self.pixel(x * 2 + 1, y * 2 + 1).unwrap_or(self.background),
        ];

        if colors.iter().all(|color| *color == colors[0]) {
            return ResolvedCell {
                symbol: " ",
                foreground: colors[0],
                background: colors[0],
            };
        }

        let foreground = colors
            .iter()
            .copied()
            .filter(|color| *color != self.background)
            .max_by_key(|candidate| colors.iter().filter(|color| **color == *candidate).count())
            .unwrap_or(colors[0]);
        let background = colors
            .iter()
            .copied()
            .filter(|color| *color != foreground)
            .max_by_key(|candidate| colors.iter().filter(|color| **color == *candidate).count())
            .unwrap_or(self.background);

        let mask = colors
            .iter()
            .enumerate()
            .fold(0_u8, |mask, (index, color)| {
                if *color == foreground {
                    mask | (1 << index)
                } else {
                    mask
                }
            });

        ResolvedCell {
            symbol: quadrant_symbol(mask),
            foreground,
            background,
        }
    }
}

impl Widget for &SubcellSurface {
    fn render(self, area: Rect, buffer: &mut Buffer) {
        let width = area.width.min(self.width);
        let height = area.height.min(self.height);
        for y in 0..height {
            for x in 0..width {
                let resolved = self.resolved_cell(usize::from(x), usize::from(y));
                buffer[(area.x + x, area.y + y)]
                    .set_symbol(resolved.symbol)
                    .set_style(
                        Style::default()
                            .fg(resolved.foreground)
                            .bg(resolved.background),
                    );
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct ResolvedCell {
    symbol: &'static str,
    foreground: Color,
    background: Color,
}

pub fn quadrant_symbol(mask: u8) -> &'static str {
    match mask & 0b1111 {
        0b0000 => " ",
        0b0001 => "▘",
        0b0010 => "▝",
        0b0011 => "▀",
        0b0100 => "▖",
        0b0101 => "▌",
        0b0110 => "▞",
        0b0111 => "▛",
        0b1000 => "▗",
        0b1001 => "▚",
        0b1010 => "▐",
        0b1011 => "▜",
        0b1100 => "▄",
        0b1101 => "▙",
        0b1110 => "▟",
        0b1111 => "█",
        _ => unreachable!(),
    }
}

fn point_in_polygon(point: (f32, f32), polygon: &[(f32, f32)]) -> bool {
    let mut inside = false;
    let mut previous = polygon.len() - 1;
    for current in 0..polygon.len() {
        let (current_x, current_y) = polygon[current];
        let (previous_x, previous_y) = polygon[previous];
        if ((current_y > point.1) != (previous_y > point.1))
            && point.0
                < (previous_x - current_x) * (point.1 - current_y) / (previous_y - current_y)
                    + current_x
        {
            inside = !inside;
        }
        previous = current;
    }
    inside
}

fn distance_to_segment(point: (f32, f32), start: (f32, f32), end: (f32, f32)) -> f32 {
    let segment = (end.0 - start.0, end.1 - start.1);
    let length_squared = segment.0 * segment.0 + segment.1 * segment.1;
    if length_squared == 0.0 {
        return ((point.0 - start.0).powi(2) + (point.1 - start.1).powi(2)).sqrt();
    }
    let projection = (((point.0 - start.0) * segment.0 + (point.1 - start.1) * segment.1)
        / length_squared)
        .clamp(0.0, 1.0);
    let closest = (
        start.0 + projection * segment.0,
        start.1 + projection * segment.1,
    );
    ((point.0 - closest.0).powi(2) + (point.1 - closest.1).powi(2)).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quadrant_masks_cover_every_two_by_two_combination() {
        let symbols = (0..16).map(quadrant_symbol).collect::<Vec<_>>();
        assert_eq!(symbols.len(), 16);
        assert_eq!(symbols[0], " ");
        assert_eq!(symbols[3], "▀");
        assert_eq!(symbols[12], "▄");
        assert_eq!(symbols[15], "█");
    }

    #[test]
    fn polygon_rasterizer_uses_background_for_solid_cells() {
        let mut surface = SubcellSurface::new(8, 4, Color::Black);
        surface.fill_rect(0.0, 0.0, 8.0, 4.0, Color::Red);
        let cell = surface.resolved_cell(3, 2);
        assert_eq!(cell.symbol, " ");
        assert_eq!(cell.background, Color::Red);
    }
}
