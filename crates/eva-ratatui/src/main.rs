use std::{env, error::Error, io};

use eva_ratatui::{
    app::{App, Scene},
    buffer_svg, buffer_text, render_test_frame,
};

#[derive(Debug)]
struct Options {
    scene: Scene,
    frames_per_second: u16,
    dump: bool,
    svg: Option<String>,
    width: u16,
    height: u16,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            scene: Scene::Earthquake,
            frames_per_second: 12,
            dump: false,
            svg: None,
            width: 100,
            height: 29,
        }
    }
}

fn main() -> Result<(), Box<dyn Error>> {
    let options = parse_options(env::args().skip(1))?;
    let mut app = App::default();
    app.scene = options.scene;
    app.frames_per_second = options.frames_per_second;

    if options.dump || options.svg.is_some() {
        let buffer = render_test_frame(&app, options.width, options.height)?;
        if let Some(path) = options.svg {
            std::fs::write(&path, buffer_svg(&buffer))?;
            println!("{path}");
        } else {
            println!("{}", buffer_text(&buffer));
        }
        return Ok(());
    }

    let mut terminal = ratatui::init();
    let result = app.run(&mut terminal);
    ratatui::restore();
    result.map_err(Into::into)
}

fn parse_options(arguments: impl IntoIterator<Item = String>) -> Result<Options, io::Error> {
    let mut options = Options::default();
    let mut arguments = arguments.into_iter();
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--scene" => {
                let value = required_value(&mut arguments, "--scene")?;
                options.scene = Scene::parse(&value).ok_or_else(|| {
                    io::Error::new(
                        io::ErrorKind::InvalidInput,
                        format!("unknown scene: {value}"),
                    )
                })?;
            }
            "--fps" => {
                let value = required_value(&mut arguments, "--fps")?;
                options.frames_per_second = value.parse::<u16>().map_err(|_| {
                    io::Error::new(io::ErrorKind::InvalidInput, "--fps must be an integer")
                })?;
                if !(1..=30).contains(&options.frames_per_second) {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        "--fps must be between 1 and 30",
                    ));
                }
            }
            "--width" => {
                options.width = required_value(&mut arguments, "--width")?
                    .parse::<u16>()
                    .map_err(|_| {
                        io::Error::new(io::ErrorKind::InvalidInput, "--width must be an integer")
                    })?;
            }
            "--height" => {
                options.height = required_value(&mut arguments, "--height")?
                    .parse::<u16>()
                    .map_err(|_| {
                        io::Error::new(io::ErrorKind::InvalidInput, "--height must be an integer")
                    })?;
            }
            "--dump" => options.dump = true,
            "--svg" => options.svg = Some(required_value(&mut arguments, "--svg")?),
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            value => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    format!("unknown option: {value}"),
                ));
            }
        }
    }
    Ok(options)
}

fn required_value(
    arguments: &mut impl Iterator<Item = String>,
    option: &str,
) -> Result<String, io::Error> {
    arguments.next().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("{option} requires a value"),
        )
    })
}

fn print_help() {
    println!(
        "\
EVA Ratatui prototype

Usage:
  eva-ratatui [--scene earthquake|stations] [--fps 1..30]
  eva-ratatui --dump [--scene earthquake|stations] [--width 100] [--height 29]
  eva-ratatui --svg <file> [--scene earthquake|stations] [--width 100] [--height 29]

Controls:
  Tab / e / s       switch scenes
  Arrow keys        select a station
  Space             pause animation
  q / Ctrl-C        quit"
    );
}
