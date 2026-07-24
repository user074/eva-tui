use ratatui::{
    buffer::Buffer,
    layout::Rect,
    style::{Color, Modifier, Style},
    widgets::Widget,
    Frame,
};

use crate::{
    app::App,
    cell_widgets::StationBlock,
    drawing::{
        centered_text, fill_background, footer_style, horizontal_rule, label_style, put_symbol,
        put_text, vertical_rule, STATION_ACCENT_WIDTH_RATIO,
    },
    palette::{AMBER, BLACK, CRIMSON, DIM, GREEN, ORANGE, WHITE},
};

#[derive(Debug, Clone, Copy)]
pub struct Station {
    pub label: &'static str,
    pub status: &'static str,
    pub events: u8,
    pub tone: Color,
}

pub const STATIONS: [Station; 12] = [
    Station {
        label: "CODEX CORE",
        status: "ONLINE",
        events: 1,
        tone: GREEN,
    },
    Station {
        label: "SHELL-01",
        status: "ACTIVE",
        events: 4,
        tone: GREEN,
    },
    Station {
        label: "GIT CONTROL",
        status: "READY",
        events: 2,
        tone: GREEN,
    },
    Station {
        label: "WORKSPACE",
        status: "CHANGED",
        events: 7,
        tone: ORANGE,
    },
    Station {
        label: "TOOL BUS",
        status: "ONLINE",
        events: 5,
        tone: GREEN,
    },
    Station {
        label: "AGENT LINK",
        status: "STANDBY",
        events: 0,
        tone: DIM,
    },
    Station {
        label: "AUDIO",
        status: "PLAYING",
        events: 3,
        tone: GREEN,
    },
    Station {
        label: "THREAD CORE",
        status: "READY",
        events: 8,
        tone: GREEN,
    },
    Station {
        label: "PLAN SYNC",
        status: "ACTIVE",
        events: 6,
        tone: ORANGE,
    },
    Station {
        label: "CONTEXT",
        status: "NOMINAL",
        events: 2,
        tone: GREEN,
    },
    Station {
        label: "DIFF FIELD",
        status: "CHANGED",
        events: 9,
        tone: ORANGE,
    },
    Station {
        label: "APPROVAL",
        status: "READY",
        events: 1,
        tone: GREEN,
    },
];

pub fn render_stations(frame: &mut Frame, app: &App) {
    let area = frame.area();
    let tick = if app.paused { 0 } else { app.tick };
    let branch_count = if area.width >= 116 {
        5
    } else if area.width >= 88 {
        4
    } else {
        3
    };
    let lane_width = area.width / branch_count;
    let top = area.y + 1;
    let bottom = area.bottom().saturating_sub(2);

    let buffer = frame.buffer_mut();
    fill_background(buffer, area, BLACK);
    for y in (area.y + 2..area.bottom().saturating_sub(1)).step_by(4) {
        horizontal_rule(buffer, area.x, y, area.width, "┄", CRIMSON);
    }

    for branch in 0..branch_count {
        let lane_x = area.x + branch * lane_width;
        let actual_width = if branch == branch_count - 1 {
            area.right() - lane_x
        } else {
            lane_width
        };
        let spine_x = lane_x + actual_width / 2;
        vertical_rule(
            buffer,
            spine_x,
            top,
            bottom.saturating_sub(top) + 1,
            "┃",
            ORANGE,
        );
        put_symbol(buffer, spine_x, top, "▼", label_style(ORANGE));
        put_symbol(buffer, spine_x, bottom, "◆", label_style(ORANGE));
        centered_text(
            buffer,
            Rect::new(lane_x, area.y, actual_width, 1),
            area.y,
            &format!("RIB-{:02}", branch + 1),
            label_style(ORANGE),
        );

        let indices = (0..STATIONS.len())
            .filter(|index| *index % usize::from(branch_count) == usize::from(branch))
            .collect::<Vec<_>>();
        for (local_index, station_index) in indices.iter().enumerate() {
            let y = if indices.len() == 1 {
                (top + bottom) / 2
            } else {
                top + 3
                    + ((bottom.saturating_sub(top + 6)) as usize * local_index
                        / (indices.len() - 1)) as u16
            };
            draw_station_node(
                buffer,
                StationNode {
                    station: STATIONS[*station_index],
                    local_index,
                    selected: *station_index == app.selected_station,
                    lane_x,
                    lane_width: actual_width,
                    spine_x,
                    y,
                    tick,
                },
            );
        }
    }

    let selected = STATIONS[app.selected_station];
    centered_text(
        buffer,
        Rect::new(area.x, area.bottom() - 1, area.width, 1),
        area.bottom() - 1,
        &format!(
            "SELECTED {:02}/{:02}  {}  //  {}  //  ↑↓ SELECT  TAB SWITCH  SPACE PAUSE  Q QUIT",
            app.selected_station + 1,
            STATIONS.len(),
            selected.label,
            selected.status,
        ),
        footer_style(),
    );
}

#[derive(Debug, Clone, Copy)]
struct StationNode {
    station: Station,
    local_index: usize,
    selected: bool,
    lane_x: u16,
    lane_width: u16,
    spine_x: u16,
    y: u16,
    tick: u64,
}

fn draw_station_node(buffer: &mut Buffer, node: StationNode) {
    let side = if node.local_index.is_multiple_of(2) {
        -1_i8
    } else {
        1_i8
    };
    let half_lane = node.lane_width / 2;
    let block_width = half_lane.saturating_sub(2).clamp(6, 9);
    let arm = half_lane.saturating_sub(block_width).max(2);
    let block_x = if side < 0 {
        node.spine_x.saturating_sub(arm + block_width)
    } else {
        node.spine_x + arm
    };
    let marker_tone = if node.selected {
        WHITE
    } else {
        node.station.tone
    };

    if side < 0 {
        let connector_x = block_x + block_width - 1;
        horizontal_rule(
            buffer,
            connector_x,
            node.y,
            node.spine_x.saturating_sub(connector_x),
            "━",
            marker_tone,
        );
        put_symbol(
            buffer,
            connector_x,
            node.y,
            if node.selected { "◆" } else { "◇" },
            label_style(marker_tone),
        );
    } else {
        horizontal_rule(
            buffer,
            node.spine_x + 1,
            node.y,
            block_x.saturating_sub(node.spine_x),
            "━",
            marker_tone,
        );
        put_symbol(
            buffer,
            block_x,
            node.y,
            if node.selected { "◆" } else { "◇" },
            label_style(marker_tone),
        );
    }
    put_symbol(
        buffer,
        node.spine_x,
        node.y,
        if node.selected {
            "◆"
        } else if side < 0 {
            "┫"
        } else {
            "┣"
        },
        label_style(marker_tone),
    );

    StationBlock::new(
        side,
        node.station.tone,
        if node.selected { WHITE } else { AMBER },
        STATION_ACCENT_WIDTH_RATIO,
    )
    .render(
        Rect::new(block_x, node.y.saturating_sub(1), block_width, 2),
        buffer,
    );

    let available = half_lane.max(5);
    let label_width = (node.station.label.len() as u16).min(available);
    let label_x = if side < 0 {
        node.spine_x.saturating_sub(label_width)
    } else {
        node.spine_x + 1
    };
    put_text(
        buffer,
        label_x.max(node.lane_x),
        node.y + 1,
        available,
        node.station.label,
        Style::default()
            .fg(marker_tone)
            .add_modifier(if node.selected {
                Modifier::BOLD
            } else {
                Modifier::empty()
            }),
    );

    let code = format!(
        "[{} {:02}]",
        status_code(node.station.status),
        node.station.events
    );
    let code_width = code.len() as u16;
    let code_x = if side < 0 {
        node.spine_x.saturating_sub(code_width)
    } else {
        node.spine_x + 1
    };
    put_text(
        buffer,
        code_x.max(node.lane_x),
        node.y + 2,
        available,
        &code,
        Style::default()
            .fg(marker_tone)
            .add_modifier(if node.selected || node.tick % 8 < 4 {
                Modifier::BOLD
            } else {
                Modifier::empty()
            }),
    );

    if node.selected && node.tick % 6 < 3 {
        put_symbol(
            buffer,
            if side < 0 {
                node.lane_x
            } else {
                node.lane_x + node.lane_width.saturating_sub(1)
            },
            node.y,
            if side < 0 { "▶" } else { "◀" },
            label_style(WHITE),
        );
    }
}

fn status_code(status: &str) -> &'static str {
    match status {
        "ONLINE" | "READY" | "NOMINAL" | "PLAYING" => "OK",
        "ACTIVE" => "ACT",
        "CHANGED" => "CHG",
        _ => "---",
    }
}
