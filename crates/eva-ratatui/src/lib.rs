pub mod app;
pub mod cell_widgets;
pub mod drawing;
pub mod palette;
pub mod scenes;
pub mod subcell;

use ratatui::{backend::TestBackend, buffer::Buffer, layout::Rect, Terminal};

pub fn render_test_frame(
    app: &app::App,
    width: u16,
    height: u16,
) -> Result<Buffer, std::io::Error> {
    let backend = TestBackend::new(width, height);
    let mut terminal = Terminal::new(backend)?;
    terminal.draw(|frame| scenes::render(frame, app))?;
    Ok(terminal.backend().buffer().clone())
}

pub fn buffer_text(buffer: &Buffer) -> String {
    let area = buffer.area;
    let mut output = String::new();
    for y in area.y..area.bottom() {
        for x in area.x..area.right() {
            output.push_str(buffer[(x, y)].symbol());
        }
        if y + 1 < area.bottom() {
            output.push('\n');
        }
    }
    output
}

pub fn viewport(buffer: &Buffer) -> Rect {
    buffer.area
}

pub fn buffer_svg(buffer: &Buffer) -> String {
    use ratatui::style::Modifier;

    const CELL_WIDTH: u16 = 10;
    const CELL_HEIGHT: u16 = 18;
    let width = buffer.area.width * CELL_WIDTH;
    let height = buffer.area.height * CELL_HEIGHT;
    let mut backgrounds = String::new();
    let mut glyphs = String::new();

    for y in buffer.area.y..buffer.area.bottom() {
        for x in buffer.area.x..buffer.area.right() {
            let cell = &buffer[(x, y)];
            let cell_x = (x - buffer.area.x) * CELL_WIDTH;
            let cell_y = (y - buffer.area.y) * CELL_HEIGHT;
            if let Some(color) = svg_color(cell.bg) {
                backgrounds.push_str(&format!(
                    r#"<rect x="{cell_x}" y="{cell_y}" width="{CELL_WIDTH}" height="{CELL_HEIGHT}" fill="{color}"/>"#
                ));
            }
            if !cell.symbol().is_empty() && cell.symbol() != " " {
                let color = svg_color(cell.fg).unwrap_or("#f6ead7".to_owned());
                let weight = if cell.modifier.contains(Modifier::BOLD) {
                    700
                } else {
                    400
                };
                glyphs.push_str(&format!(
                    r#"<text x="{cell_x}" y="{}" fill="{color}" font-family="Menlo, Monaco, 'Courier New', monospace" font-size="15" font-weight="{weight}">{}</text>"#,
                    cell_y + 15,
                    escape_xml(cell.symbol()),
                ));
            }
        }
    }

    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><rect width="100%" height="100%" fill="#090807"/>{backgrounds}{glyphs}</svg>"##
    )
}

fn svg_color(color: ratatui::style::Color) -> Option<String> {
    match color {
        ratatui::style::Color::Rgb(red, green, blue) => {
            Some(format!("#{red:02x}{green:02x}{blue:02x}"))
        }
        ratatui::style::Color::Black => Some("#000000".to_owned()),
        ratatui::style::Color::White => Some("#ffffff".to_owned()),
        ratatui::style::Color::Red => Some("#ff0000".to_owned()),
        ratatui::style::Color::Green => Some("#00ff00".to_owned()),
        ratatui::style::Color::Yellow => Some("#ffff00".to_owned()),
        ratatui::style::Color::Blue => Some("#0000ff".to_owned()),
        ratatui::style::Color::Magenta => Some("#ff00ff".to_owned()),
        ratatui::style::Color::Cyan => Some("#00ffff".to_owned()),
        ratatui::style::Color::Gray => Some("#808080".to_owned()),
        ratatui::style::Color::DarkGray => Some("#404040".to_owned()),
        ratatui::style::Color::LightRed => Some("#ff6666".to_owned()),
        ratatui::style::Color::LightGreen => Some("#66ff66".to_owned()),
        ratatui::style::Color::LightYellow => Some("#ffff66".to_owned()),
        ratatui::style::Color::LightBlue => Some("#6666ff".to_owned()),
        ratatui::style::Color::LightMagenta => Some("#ff66ff".to_owned()),
        ratatui::style::Color::LightCyan => Some("#66ffff".to_owned()),
        ratatui::style::Color::Indexed(index) => {
            let value = index;
            Some(format!("#{value:02x}{value:02x}{value:02x}"))
        }
        ratatui::style::Color::Reset => None,
    }
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use ratatui::style::Color;

    use super::*;

    #[test]
    fn earthquake_screen_contains_dense_shapes_and_braille_signal() {
        let app = app::App::default();
        let buffer = render_test_frame(&app, 100, 29).expect("render");
        let text = buffer_text(&buffer);
        assert!(text.contains("WARNING / GEMPA BUMI"));
        assert!(text.contains("MAGNITUDE"));
        assert!(text.contains("TEST INCIDENT DOSSIER"));
        assert!(
            buffer
                .content()
                .iter()
                .filter(|cell| cell.bg == palette::RED)
                .count()
                > 120
        );
        assert!(buffer.content().iter().any(|cell| cell
            .symbol()
            .chars()
            .any(|symbol| { ('\u{2800}'..='\u{28ff}').contains(&symbol) })));
    }

    #[test]
    fn station_screen_is_selectable_and_uses_filled_rectangular_nodes() {
        let mut app = app::App::default();
        app.scene = app::Scene::Stations;
        app.selected_station = 4;
        let buffer = render_test_frame(&app, 100, 29).expect("render");
        let text = buffer_text(&buffer);
        assert!(text.contains("RIB-01"));
        assert!(text.contains("TOOL BUS"));
        assert!(text.contains("SELECTED 05/12"));
        assert!(!buffer
            .content()
            .iter()
            .any(|cell| { matches!(cell.symbol(), "◤" | "◥" | "◣" | "◢") }));
        assert!(!buffer.content().iter().any(|cell| {
            matches!(
                cell.symbol(),
                "▘" | "▝" | "▖" | "▗" | "▞" | "▚" | "▛" | "▜" | "▙" | "▟"
            )
        }));
        assert!(
            buffer
                .content()
                .iter()
                .filter(|cell| cell.bg == Color::Rgb(46, 230, 107))
                .count()
                > 40
        );
    }

    #[test]
    fn station_selection_wraps_in_both_directions() {
        let mut app = app::App::default();
        app.scene = app::Scene::Stations;
        app.handle_key(
            crossterm::event::KeyCode::Up,
            crossterm::event::KeyModifiers::NONE,
        );
        assert_eq!(app.selected_station, scenes::STATIONS.len() - 1);
        app.handle_key(
            crossterm::event::KeyCode::Down,
            crossterm::event::KeyModifiers::NONE,
        );
        assert_eq!(app.selected_station, 0);
    }
}
