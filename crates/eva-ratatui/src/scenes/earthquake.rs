use ratatui::{
    buffer::Buffer,
    layout::Rect,
    style::{Modifier, Style},
    symbols::Marker,
    widgets::canvas::{Canvas, Points},
    Frame,
};

use crate::{
    app::App,
    drawing::{
        centered_text, dark_label_style, draw_dense_stripe, draw_hazard_rail, draw_sharp_data_hex,
        draw_sharp_long_hex, draw_sharp_warning_hex, fill_background, footer_style,
        horizontal_rule, label_style, outline_box, put_symbol, put_text,
    },
    palette::{AMBER, BLACK, CYAN, DIM, ORANGE, RED, WHITE},
};

pub fn render_earthquake(frame: &mut Frame, app: &App) {
    let area = frame.area();
    let tick = if app.paused { 0 } else { app.tick };
    let header_width = area.width.min(58);
    let header_x = area.x + (area.width - header_width) / 2;
    let header = Rect::new(header_x, area.y + 3, header_width, 6);
    let side_hex_width = 13;
    let show_sides = area.width >= 92;
    let module_width = if area.width >= 100 { 16 } else { 14 };
    let module_gap = 1;
    let group_width = module_width * 3 + module_gap * 2;
    let group_x = area.x + (area.width - group_width) / 2;
    let module_y = area.y + 11;
    let dossier_y = area.y + 19;
    let dossier_bottom = area.bottom().saturating_sub(2);
    let dossier_height = dossier_bottom.saturating_sub(dossier_y);
    let dossier = Rect::new(
        area.x + if show_sides { 15 } else { 3 },
        dossier_y,
        area.width - if show_sides { 30 } else { 6 },
        dossier_height,
    );

    {
        let buffer = frame.buffer_mut();
        fill_background(buffer, area, BLACK);
        draw_hazard_rail(
            buffer,
            area.y,
            area.width,
            "EARTHQUAKE  //  地震",
            tick,
            ORANGE,
            false,
        );
        draw_hazard_rail(
            buffer,
            area.bottom() - 2,
            area.width,
            "EARTHQUAKE  //  地震",
            tick + 4,
            ORANGE,
            true,
        );

        draw_sharp_long_hex(buffer, header, RED);
        if show_sides {
            draw_sharp_warning_hex(
                buffer,
                Rect::new(
                    header_x - side_hex_width - 3,
                    header.y,
                    side_hex_width,
                    header.height,
                ),
                RED,
            );
            draw_sharp_warning_hex(
                buffer,
                Rect::new(header.right() + 3, header.y, side_hex_width, header.height),
                RED,
            );
        }

        horizontal_rule(
            buffer,
            group_x + module_width - 1,
            module_y + 3,
            module_gap + 2,
            "━",
            AMBER,
        );
        horizontal_rule(
            buffer,
            group_x + module_width * 2 + module_gap - 1,
            module_y + 3,
            module_gap + 2,
            "━",
            AMBER,
        );
        for index in 0..3 {
            let y = module_y + if index == 1 { 1 } else { 0 };
            draw_sharp_data_hex(
                buffer,
                Rect::new(
                    group_x + index * (module_width + module_gap),
                    y,
                    module_width,
                    6,
                ),
                RED,
            );
        }

        if show_sides {
            draw_placard(
                buffer,
                Rect::new(area.x + 1, module_y, 12, 7),
                tick,
                "地震",
                "GEMPA",
            );
            draw_placard(
                buffer,
                Rect::new(area.right() - 13, module_y, 12, 7),
                tick + 3,
                "地震",
                "BUMI",
            );
        }
        if dossier.height >= 5 {
            draw_dossier(buffer, dossier, tick);
        }
    }

    if dossier.height >= 6 && dossier.width >= 30 {
        render_sync_scope(frame, dossier, tick);
    }

    let buffer = frame.buffer_mut();
    centered_text(
        buffer,
        header,
        header.y + 1,
        "TEST EVENT / 試験",
        dark_label_style(),
    );
    centered_text(
        buffer,
        header,
        header.y + 2,
        "WARNING / GEMPA BUMI",
        dark_label_style(),
    );
    centered_text(
        buffer,
        header,
        header.y + 3,
        "EARTHQUAKE DETECTED",
        Style::default().fg(BLACK),
    );

    if show_sides {
        let left = Rect::new(
            header_x - side_hex_width - 3,
            header.y,
            side_hex_width,
            header.height,
        );
        let right = Rect::new(header.right() + 3, header.y, side_hex_width, header.height);
        centered_text(buffer, left, left.y + 2, "WARNING", label_style(RED));
        centered_text(buffer, left, left.y + 3, "▲", label_style(WHITE));
        centered_text(buffer, right, right.y + 2, "WARNING", label_style(RED));
        centered_text(buffer, right, right.y + 3, "▲", label_style(WHITE));
    }

    let module_labels = [
        ("MAGNITUDE", "6.2 TEST"),
        ("SYNC LINK", if app.paused { "PAUSED" } else { "FIXTURE" }),
        ("DEPTH", "10 KM"),
    ];
    for (index, (title, value)) in module_labels.iter().enumerate() {
        let y = module_y + if index == 1 { 1 } else { 0 };
        let module = Rect::new(
            group_x + index as u16 * (module_width + module_gap),
            y,
            module_width,
            6,
        );
        centered_text(buffer, module, module.y + 2, title, dark_label_style());
        centered_text(buffer, module, module.y + 3, value, dark_label_style());
    }

    if dossier.height >= 5 {
        let title = " TEST INCIDENT DOSSIER ";
        put_text(
            buffer,
            dossier.x + (dossier.width.saturating_sub(title.len() as u16)) / 2,
            dossier.y,
            dossier.width - 2,
            title,
            Style::default()
                .fg(BLACK)
                .bg(AMBER)
                .add_modifier(Modifier::BOLD),
        );
        put_text(
            buffer,
            dossier.x + 4,
            dossier.y + 2,
            dossier.width / 2,
            "SIGNAL LOCK / OPERATOR REVIEW",
            footer_style(),
        );
        put_text(
            buffer,
            dossier.right().saturating_sub(23),
            dossier.y + 2,
            20,
            if app.paused {
                "SYNC HOLD: PAUSED"
            } else {
                "SYNC HOLD: ACTIVE"
            },
            label_style(if app.paused { DIM } else { CYAN }),
        );
    }
}

fn render_sync_scope(frame: &mut Frame, dossier: Rect, tick: u64) {
    let scope_area = Rect::new(
        dossier.x + 4,
        dossier.y + 3,
        dossier.width.saturating_sub(8),
        dossier.height.saturating_sub(5),
    );
    if scope_area.height == 0 {
        return;
    }
    let points = (0..usize::from(scope_area.width) * 4)
        .map(|index| {
            let x = index as f64;
            let phase = tick as f64 * 0.14;
            let carrier = (x * 0.18 + phase).sin() * 0.55;
            let pulse = if ((index / 14) + tick as usize / 4).is_multiple_of(5) {
                0.30
            } else {
                0.0
            };
            (x, carrier + pulse)
        })
        .collect::<Vec<_>>();
    let canvas = Canvas::default()
        .marker(Marker::Braille)
        .x_bounds([0.0, points.len().max(1) as f64])
        .y_bounds([-1.0, 1.0])
        .paint(|context| {
            context.draw(&Points {
                coords: &points,
                color: CYAN,
            });
        });
    frame.render_widget(canvas, scope_area);
}

fn draw_placard(buffer: &mut Buffer, area: Rect, tick: u64, kanji: &str, label: &str) {
    fill_background(buffer, area, BLACK);
    outline_box(buffer, area, RED);
    draw_dense_stripe(
        buffer,
        area.x + 1,
        area.y + 1,
        area.width.saturating_sub(2),
        tick,
        AMBER,
        false,
    );
    draw_dense_stripe(
        buffer,
        area.x + 1,
        area.bottom() - 2,
        area.width.saturating_sub(2),
        tick,
        AMBER,
        true,
    );
    centered_text(buffer, area, area.y + 2, kanji, label_style(RED));
    centered_text(buffer, area, area.y + 3, label, label_style(WHITE));
    centered_text(buffer, area, area.y + 4, "ALERT", label_style(RED));
}

fn draw_dossier(buffer: &mut Buffer, area: Rect, tick: u64) {
    fill_background(buffer, area, BLACK);
    outline_box(buffer, area, AMBER);
    draw_dense_stripe(
        buffer,
        area.x + 1,
        area.y + 1,
        area.width.saturating_sub(2),
        tick,
        AMBER,
        false,
    );
    draw_dense_stripe(
        buffer,
        area.x + 1,
        area.bottom() - 2,
        area.width.saturating_sub(2),
        tick,
        AMBER,
        true,
    );
    for y in area.y + 2..area.bottom().saturating_sub(2) {
        let phase = u64::from(y % 2);
        draw_dense_stripe(buffer, area.x + 1, y, 2, phase, AMBER, false);
        draw_dense_stripe(buffer, area.right() - 3, y, 2, phase, AMBER, true);
    }
    put_symbol(buffer, area.x, area.y, "╭", Style::default().fg(AMBER));
    put_symbol(
        buffer,
        area.right() - 1,
        area.y,
        "╮",
        Style::default().fg(AMBER),
    );
    put_symbol(
        buffer,
        area.x,
        area.bottom() - 1,
        "╰",
        Style::default().fg(AMBER),
    );
    put_symbol(
        buffer,
        area.right() - 1,
        area.bottom() - 1,
        "╯",
        Style::default().fg(AMBER),
    );
}
