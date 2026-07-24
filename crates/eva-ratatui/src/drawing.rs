use ratatui::{
    buffer::Buffer,
    layout::Rect,
    style::{Color, Modifier, Style},
};
use unicode_width::UnicodeWidthStr;

use crate::{
    palette::{AMBER, BLACK, ORANGE},
    subcell::SubcellSurface,
};

pub const LONG_HEX_CAP_RATIO: f32 = 146.257 / 1564.0;
pub const DATA_HEX_CAP_RATIO: f32 = 145.77 / 584.0;
pub const STATION_BLADE_SKEW_RATIO: f32 = 37.5414 / 500.0;
pub const STATION_ACCENT_WIDTH_RATIO: f32 = 168.5 / 500.0;
pub const STATION_ACCENT_HEIGHT_RATIO: f32 = 19.0 / 100.0;

pub fn fill_background(buffer: &mut Buffer, area: Rect, color: Color) {
    let right = area.right().min(buffer.area.right());
    let bottom = area.bottom().min(buffer.area.bottom());
    for y in area.y..bottom {
        for x in area.x..right {
            buffer[(x, y)]
                .set_symbol(" ")
                .set_style(Style::default().fg(color).bg(color));
        }
    }
}

fn row_inset(row: u16, height: u16, cap_columns: u16) -> u16 {
    let middle = f32::from(height.saturating_sub(1)) / 2.0;
    if middle <= 0.0 {
        return 0;
    }
    (((f32::from(row) - middle).abs() / middle) * f32::from(cap_columns)).round() as u16
}

fn background_at(buffer: &Buffer, x: u16, y: u16) -> Color {
    if x >= buffer.area.right() || y >= buffer.area.bottom() {
        BLACK
    } else {
        buffer[(x, y)].bg
    }
}

fn draw_cell_hex_surface(buffer: &mut Buffer, area: Rect, cap_ratio: f32, fill: Color) {
    if area.width < 6 || area.height < 3 {
        return;
    }
    let cap_columns = ((f32::from(area.width) * cap_ratio).round() as u16)
        .max(1)
        .min(area.width.saturating_sub(4) / 2);
    let middle = f32::from(area.height.saturating_sub(1)) / 2.0;

    for row in 0..area.height {
        let inset = row_inset(row, area.height, cap_columns);
        let left = area.x + inset;
        let right = area.right().saturating_sub(inset + 1);
        if right < left || right >= buffer.area.right() {
            continue;
        }

        let y = area.y + row;
        let left_outside = background_at(buffer, left, y);
        let right_outside = background_at(buffer, right, y);
        for x in left..=right {
            buffer[(x, y)]
                .set_symbol(" ")
                .set_style(Style::default().fg(fill).bg(fill));
        }

        if (f32::from(row) - middle).abs() < 0.5 {
            continue;
        }
        let above = f32::from(row) < middle;
        buffer[(left, y)]
            .set_symbol(if above { "◤" } else { "◣" })
            .set_style(
                Style::default()
                    .fg(left_outside)
                    .bg(fill)
                    .add_modifier(Modifier::BOLD),
            );
        if right > left {
            buffer[(right, y)]
                .set_symbol(if above { "◥" } else { "◢" })
                .set_style(
                    Style::default()
                        .fg(right_outside)
                        .bg(fill)
                        .add_modifier(Modifier::BOLD),
                );
        }
    }
}

fn draw_inset_seam(buffer: &mut Buffer, area: Rect, cap_ratio: f32, fill: Color, seam: Color) {
    let cap_columns = ((f32::from(area.width) * cap_ratio).round() as u16).max(1);
    let seam_x = area.x.saturating_add(cap_columns + 1);
    let seam_width = area.width.saturating_sub((cap_columns + 1) * 2);
    if seam_width == 0 {
        return;
    }
    for y in [area.y, area.bottom().saturating_sub(1)] {
        for x in seam_x..seam_x.saturating_add(seam_width) {
            put_symbol(buffer, x, y, "━", Style::default().fg(seam).bg(fill));
        }
    }
}

pub fn draw_sharp_long_hex(buffer: &mut Buffer, area: Rect, fill: Color) {
    draw_cell_hex_surface(buffer, area, LONG_HEX_CAP_RATIO, fill);
    draw_inset_seam(buffer, area, LONG_HEX_CAP_RATIO, fill, BLACK);
}

pub fn draw_sharp_data_hex(buffer: &mut Buffer, area: Rect, fill: Color) {
    draw_cell_hex_surface(buffer, area, DATA_HEX_CAP_RATIO, fill);
    draw_inset_seam(buffer, area, DATA_HEX_CAP_RATIO, fill, BLACK);
}

pub fn draw_sharp_warning_hex(buffer: &mut Buffer, area: Rect, tone: Color) {
    if area.width < 6 || area.height < 3 {
        return;
    }
    let cap_columns = ((f32::from(area.width) * DATA_HEX_CAP_RATIO).round() as u16)
        .max(1)
        .min(area.width.saturating_sub(4) / 2);
    let middle = f32::from(area.height.saturating_sub(1)) / 2.0;
    for row in 0..area.height {
        let inset = row_inset(row, area.height, cap_columns);
        let left = area.x + inset;
        let right = area.right().saturating_sub(inset + 1);
        let y = area.y + row;
        let centered = (f32::from(row) - middle).abs() < 0.5;
        let above = f32::from(row) < middle;
        let style = Style::default()
            .fg(BLACK)
            .bg(tone)
            .add_modifier(Modifier::BOLD);
        put_symbol(
            buffer,
            left,
            y,
            if centered {
                " "
            } else if above {
                "◤"
            } else {
                "◣"
            },
            style,
        );
        if right > left {
            put_symbol(
                buffer,
                right,
                y,
                if centered {
                    " "
                } else if above {
                    "◥"
                } else {
                    "◢"
                },
                style,
            );
        }
        if (row == 0 || row + 1 == area.height) && right > left + 1 {
            horizontal_rule(buffer, left + 1, y, right - left - 1, "━", tone);
        }
    }
}

pub fn draw_dense_stripe(
    buffer: &mut Buffer,
    x: u16,
    y: u16,
    width: u16,
    phase: u64,
    tone: Color,
    inverted: bool,
) {
    let pair = if inverted {
        ["◣", "◥"]
    } else {
        ["◢", "◤"]
    };
    for index in 0..width {
        put_symbol(
            buffer,
            x + index,
            y,
            pair[(usize::from(index) + phase as usize / 2) % 2],
            Style::default()
                .fg(tone)
                .bg(BLACK)
                .add_modifier(Modifier::BOLD),
        );
    }
}

pub fn draw_hazard_rail(
    buffer: &mut Buffer,
    y: u16,
    width: u16,
    label: &str,
    phase: u64,
    tone: Color,
    inverted: bool,
) {
    if y + 1 >= buffer.area.bottom() {
        return;
    }
    fill_background(buffer, Rect::new(0, y, width, 2), BLACK);
    let mut repeated = String::new();
    while UnicodeWidthStr::width(repeated.as_str()) < usize::from(width) + 8 {
        repeated.push_str("  ");
        repeated.push_str(label);
        repeated.push_str("  //");
    }
    let label_y = if inverted { y + 1 } else { y };
    let stripe_y = if inverted { y } else { y + 1 };
    put_text(
        buffer,
        0,
        label_y,
        width,
        &repeated,
        Style::default()
            .fg(tone)
            .bg(BLACK)
            .add_modifier(Modifier::BOLD),
    );
    draw_dense_stripe(buffer, 0, stripe_y, width, phase, tone, inverted);
}

pub fn draw_sharp_station_blade(
    buffer: &mut Buffer,
    area: Rect,
    direction: i8,
    tone: Color,
    accent: Color,
) {
    if area.width < 4 || area.height == 0 {
        return;
    }
    let x = area.x;
    let y = area.y;
    let right = area.right().saturating_sub(1);
    let left_outside = background_at(buffer, x, y);
    let right_outside = background_at(buffer, right, y);
    let left_cutout = if direction < 0 { "◤" } else { "◣" };
    let right_cutout = if direction < 0 { "◢" } else { "◥" };
    put_symbol(
        buffer,
        x,
        y,
        left_cutout,
        Style::default().fg(left_outside).bg(tone),
    );
    fill_background(
        buffer,
        Rect::new(x + 1, y, area.width.saturating_sub(2), 1),
        tone,
    );
    put_symbol(
        buffer,
        right,
        y,
        right_cutout,
        Style::default().fg(right_outside).bg(tone),
    );
    let accent_width = ((f32::from(area.width) * STATION_ACCENT_WIDTH_RATIO).round() as u16)
        .max(1)
        .min(area.width.saturating_sub(2));
    for column in x + 1..x + 1 + accent_width {
        put_symbol(
            buffer,
            column,
            y,
            "━",
            Style::default()
                .fg(accent)
                .bg(tone)
                .add_modifier(Modifier::BOLD),
        );
    }
}

pub fn hexagon(x: f32, y: f32, width: f32, height: f32, cap_ratio: f32) -> [(f32, f32); 6] {
    let cap = (width * cap_ratio).min(width / 2.0);
    [
        (x + cap, y),
        (x + width - cap, y),
        (x + width, y + height / 2.0),
        (x + width - cap, y + height),
        (x + cap, y + height),
        (x, y + height / 2.0),
    ]
}

pub fn draw_layered_hex(
    surface: &mut SubcellSurface,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    cap_ratio: f32,
    tone: Color,
) {
    surface.fill_polygon(&hexagon(x, y, width, height, cap_ratio), tone);
    if width >= 8.0 && height >= 3.0 {
        surface.fill_polygon(
            &hexagon(x + 0.5, y + 0.5, width - 1.0, height - 1.0, cap_ratio),
            BLACK,
        );
        surface.fill_polygon(
            &hexagon(x + 1.0, y + 1.0, width - 2.0, height - 2.0, cap_ratio),
            tone,
        );
    }
}

#[derive(Debug, Clone, Copy)]
pub struct StationBlade {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub direction: i8,
    pub tone: Color,
    pub selected: bool,
}

pub fn draw_station_blade(surface: &mut SubcellSurface, blade: StationBlade) {
    let skew = blade.width * STATION_BLADE_SKEW_RATIO;
    let points = if blade.direction < 0 {
        [
            (blade.x + skew, blade.y),
            (blade.x + blade.width, blade.y),
            (blade.x + blade.width - skew, blade.y + blade.height),
            (blade.x, blade.y + blade.height),
        ]
    } else {
        [
            (blade.x, blade.y),
            (blade.x + blade.width - skew, blade.y),
            (blade.x + blade.width, blade.y + blade.height),
            (blade.x + skew, blade.y + blade.height),
        ]
    };
    surface.fill_polygon(&points, blade.tone);

    let accent_width = blade.width * STATION_ACCENT_WIDTH_RATIO;
    let accent_height = (blade.height * STATION_ACCENT_HEIGHT_RATIO).max(0.5);
    let accent = if blade.selected {
        crate::palette::WHITE
    } else {
        ORANGE
    };
    let accent_points = if blade.direction < 0 {
        [
            (blade.x + skew, blade.y),
            (blade.x + skew + accent_width, blade.y),
            (
                blade.x + skew + accent_width - skew * accent_height / blade.height,
                blade.y + accent_height,
            ),
            (
                blade.x + skew - skew * accent_height / blade.height,
                blade.y + accent_height,
            ),
        ]
    } else {
        [
            (blade.x, blade.y),
            (blade.x + accent_width, blade.y),
            (
                blade.x + accent_width + skew * accent_height / blade.height,
                blade.y + accent_height,
            ),
            (
                blade.x + skew * accent_height / blade.height,
                blade.y + accent_height,
            ),
        ]
    };
    surface.fill_polygon(&accent_points, accent);
}

pub fn draw_hazard_stripes(
    surface: &mut SubcellSurface,
    origin_x: f32,
    y: f32,
    height: f32,
    width: f32,
    phase: u64,
    tone: Color,
) {
    // strip.svg uses 26px bars on a 59.213px repeat at 21.9808°.
    let period = 6.0;
    let stripe_width = period * (26.0 / 59.213);
    let shear = height * 0.40;
    let offset = (phase as f32 * 0.25) % period;
    let mut x = origin_x - period + offset;
    while x < origin_x + width + period {
        let right = origin_x + width;
        let clip = |value: f32| value.clamp(origin_x, right);
        surface.fill_polygon(
            &[
                (clip(x + shear), y),
                (clip(x + shear + stripe_width), y),
                (clip(x + stripe_width), y + height),
                (clip(x), y + height),
            ],
            tone,
        );
        x += period;
    }
}

pub fn put_text(buffer: &mut Buffer, x: u16, y: u16, max_width: u16, value: &str, style: Style) {
    if max_width == 0 || x >= buffer.area.right() || y >= buffer.area.bottom() {
        return;
    }
    buffer.set_stringn(x, y, value, usize::from(max_width), style);
}

pub fn centered_text(buffer: &mut Buffer, area: Rect, y: u16, value: &str, style: Style) {
    if y >= area.bottom() {
        return;
    }
    let width = UnicodeWidthStr::width(value) as u16;
    let x = area.x.saturating_add(area.width.saturating_sub(width) / 2);
    put_text(buffer, x, y, area.right().saturating_sub(x), value, style);
}

pub fn put_symbol(buffer: &mut Buffer, x: u16, y: u16, symbol: &str, style: Style) {
    if x >= buffer.area.right() || y >= buffer.area.bottom() {
        return;
    }
    buffer[(x, y)].set_symbol(symbol).set_style(style);
}

pub fn horizontal_rule(
    buffer: &mut Buffer,
    x: u16,
    y: u16,
    width: u16,
    symbol: &str,
    color: Color,
) {
    for column in x..x.saturating_add(width).min(buffer.area.right()) {
        put_symbol(buffer, column, y, symbol, Style::default().fg(color));
    }
}

pub fn vertical_rule(buffer: &mut Buffer, x: u16, y: u16, height: u16, symbol: &str, color: Color) {
    for row in y..y.saturating_add(height).min(buffer.area.bottom()) {
        put_symbol(buffer, x, row, symbol, Style::default().fg(color));
    }
}

pub fn outline_box(buffer: &mut Buffer, area: Rect, color: Color) {
    if area.width < 2 || area.height < 2 {
        return;
    }
    let style = Style::default().fg(color).add_modifier(Modifier::BOLD);
    horizontal_rule(buffer, area.x + 1, area.y, area.width - 2, "━", color);
    horizontal_rule(
        buffer,
        area.x + 1,
        area.bottom() - 1,
        area.width - 2,
        "━",
        color,
    );
    vertical_rule(buffer, area.x, area.y + 1, area.height - 2, "┃", color);
    vertical_rule(
        buffer,
        area.right() - 1,
        area.y + 1,
        area.height - 2,
        "┃",
        color,
    );
    put_symbol(buffer, area.x, area.y, "┏", style);
    put_symbol(buffer, area.right() - 1, area.y, "┓", style);
    put_symbol(buffer, area.x, area.bottom() - 1, "┗", style);
    put_symbol(buffer, area.right() - 1, area.bottom() - 1, "┛", style);
}

pub fn label_style(color: Color) -> Style {
    Style::default().fg(color).add_modifier(Modifier::BOLD)
}

pub fn dark_label_style() -> Style {
    Style::default().fg(BLACK).add_modifier(Modifier::BOLD)
}

pub fn footer_style() -> Style {
    Style::default().fg(AMBER)
}
