mod earthquake;
mod stations;

use ratatui::{layout::Rect, Frame};

use crate::app::App;

pub use earthquake::render_earthquake;
pub use stations::{render_stations, STATIONS};

pub fn render_resize_notice(frame: &mut Frame, area: Rect) {
    let buffer = frame.buffer_mut();
    crate::drawing::centered_text(
        buffer,
        area,
        area.y + area.height.saturating_sub(2) / 2,
        "EVA TERMINAL REQUIRES 72×22 CELLS",
        crate::drawing::label_style(crate::palette::RED),
    );
    crate::drawing::centered_text(
        buffer,
        area,
        area.y + area.height.saturating_sub(2) / 2 + 1,
        "RESIZE WINDOW / 画面調整",
        crate::drawing::footer_style(),
    );
}

pub fn render(frame: &mut Frame, app: &App) {
    let area = frame.area();
    if area.width < 72 || area.height < 22 {
        render_resize_notice(frame, area);
        return;
    }
    match app.scene {
        crate::app::Scene::Earthquake => render_earthquake(frame, app),
        crate::app::Scene::Stations => render_stations(frame, app),
    }
}
