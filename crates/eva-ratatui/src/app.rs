use std::{
    io,
    time::{Duration, Instant},
};

use crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};
use ratatui::DefaultTerminal;

use crate::scenes::STATIONS;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scene {
    Earthquake,
    Stations,
}

impl Scene {
    pub fn parse(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "earthquake" | "quake" | "eq" => Some(Self::Earthquake),
            "stations" | "station" => Some(Self::Stations),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct App {
    pub scene: Scene,
    pub tick: u64,
    pub paused: bool,
    pub selected_station: usize,
    pub frames_per_second: u16,
    should_quit: bool,
}

impl Default for App {
    fn default() -> Self {
        Self {
            scene: Scene::Earthquake,
            tick: 0,
            paused: false,
            selected_station: 0,
            frames_per_second: 12,
            should_quit: false,
        }
    }
}

impl App {
    pub fn run(&mut self, terminal: &mut DefaultTerminal) -> io::Result<()> {
        let frame_duration =
            Duration::from_millis(1_000 / u64::from(self.frames_per_second.max(1)));
        let mut last_tick = Instant::now();

        while !self.should_quit {
            terminal.draw(|frame| crate::scenes::render(frame, self))?;
            let timeout = frame_duration.saturating_sub(last_tick.elapsed());
            if event::poll(timeout)? {
                if let Event::Key(key) = event::read()? {
                    if key.kind == KeyEventKind::Press {
                        self.handle_key(key.code, key.modifiers);
                    }
                }
            }
            if last_tick.elapsed() >= frame_duration {
                if !self.paused {
                    self.tick = self.tick.wrapping_add(1);
                }
                last_tick = Instant::now();
            }
        }
        Ok(())
    }

    pub fn handle_key(&mut self, code: KeyCode, modifiers: KeyModifiers) {
        if modifiers.contains(KeyModifiers::CONTROL)
            && matches!(code, KeyCode::Char('c') | KeyCode::Char('q'))
        {
            self.should_quit = true;
            return;
        }
        match code {
            KeyCode::Char('q') => self.should_quit = true,
            KeyCode::Tab => {
                self.scene = match self.scene {
                    Scene::Earthquake => Scene::Stations,
                    Scene::Stations => Scene::Earthquake,
                }
            }
            KeyCode::Char('e') => self.scene = Scene::Earthquake,
            KeyCode::Char('s') => self.scene = Scene::Stations,
            KeyCode::Char(' ') => self.paused = !self.paused,
            KeyCode::Up | KeyCode::Left => {
                self.selected_station = if self.selected_station == 0 {
                    STATIONS.len() - 1
                } else {
                    self.selected_station - 1
                };
            }
            KeyCode::Down | KeyCode::Right => {
                self.selected_station = (self.selected_station + 1) % STATIONS.len();
            }
            _ => {}
        }
    }
}
