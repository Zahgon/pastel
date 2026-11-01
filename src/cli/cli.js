// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/cli.rs from sharkdp/pastel v0.12.0, built on src/cli/clap, which
// reimplements the clap behaviour pastel relies on (clap: MIT OR Apache-2.0,
// Copyright (c) Individual contributors).

import { Arg, ArgAction, ColorChoice, Command } from './clap/index.js';
import { COLOR_PICKER_TOOL_NAMES } from './colorpicker_tools.js';

const SORT_OPTIONS = ['brightness', 'luminance', 'hue', 'chroma', 'random'];
const DEFAULT_SORT_ORDER = 'hue';

/**
 * Builds the `pastel` command-line interface (`build_cli`).
 *
 * @returns {Command}
 */
export function buildCli() {
  const colorArg = new Arg('color')
    .help(
      'Colors can be specified in many different formats, such as #RRGGBB, RRGGBB, ' +
        "#RGB, 'rgb(…, …, …)', 'hsl(…, …, …)', 'gray(…)' or simply by the name of the " +
        "color. The identifier '-' can be used to read a single color from standard input. " +
        "Also, the special identifier 'pick' can be used to run an external color picker " +
        'to choose a color. If no color argument is specified, colors will be read from ' +
        'standard input.\n' +
        'Examples (all of these specify the same color):' +
        '\n  - lightslategray' +
        "\n  - '#778899'" +
        '\n  - 778899' +
        '\n  - 789' +
        "\n  - 'rgb(119, 136, 153)'" +
        "\n  - '119,136,153'" +
        "\n  - 'hsl(210, 14.3%, 53.3%)'\n" +
        'Alpha transparency is also supported:' +
        "\n  - '#77889980'" +
        "\n  - 'rgba(119, 136, 153, 0.5)'" +
        "\n  - 'hsla(210, 14.3%, 53.3%, 50%)'",
    )
    .required(false)
    .action(ArgAction.Append);

  const colorspaceArg = new Arg('colorspace')
    .long('colorspace')
    .short('s')
    .valueName('name')
    .help('The colorspace in which to interpolate')
    .valueParser(['Lab', 'LCh', 'RGB', 'HSL', 'OkLab'])
    .ignoreCase(true)
    .defaultValue('Lab');

  return new Command('pastel')
    .version('0.12.0')
    .about('A command-line tool to generate, analyze, convert and manipulate colors')
    .nextDisplayOrder(null)
    .color(ColorChoice.Auto)
    .allowNegativeNumbers(true)
    .dontCollapseArgsInUsage(true)
    .maxTermWidth(100)
    .subcommandRequired(true)
    .argRequiredElseHelp(true)
    .subcommand(
      new Command('color')
        .alias('colour')
        .alias('take')
        .alias('show')
        .alias('display')
        .about('Display information about the given color')
        .longAbout(
          'Show and display some information about the given color(s).\n\n' +
            'Example:\n  ' +
            'pastel color 556270 4ecdc4 c7f484 ff6b6b c44d58',
        )
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('list')
        .about('Show a list of available color names')
        .arg(
          new Arg('sort-order')
            .short('s')
            .long('sort')
            .help('Sort order')
            .valueParser(SORT_OPTIONS)
            .defaultValue(DEFAULT_SORT_ORDER),
        ),
    )
    .subcommand(
      new Command('random')
        .about('Generate a list of random colors')
        .longAbout('Generate a list of random colors.\n\n' + 'Example:\n  ' + 'pastel random -n 20 --strategy lch_hue')
        .arg(
          new Arg('strategy')
            .long('strategy')
            .short('s')
            .help(
              'Randomization strategy:\n   ' +
                'vivid:    random hue, limited saturation and lightness values\n   ' +
                'rgb:      samples uniformly in RGB space\n   ' +
                'gray:     random gray tone (uniform)\n   ' +
                'lch_hue:  random hue, fixed lightness and chroma\n' +
                '\n' +
                "Default strategy: 'vivid'\n ",
            )
            .valueParser(['vivid', 'rgb', 'gray', 'lch_hue'])
            .hideDefaultValue(true)
            .hidePossibleValues(true)
            .defaultValue('vivid'),
        )
        .arg(
          new Arg('number')
            .long('number')
            .short('n')
            .help('Number of colors to generate')
            .action(ArgAction.Set)
            .defaultValue('10')
            .valueName('count'),
        ),
    )
    .subcommand(
      new Command('distinct')
        .about('Generate a set of visually distinct colors')
        .longAbout(
          'Generate a set of visually distinct colors by maximizing ' +
            'the perceived color difference between pairs of colors.\n\n' +
            'The default parameters for the optimization procedure ' +
            '(simulated annealing) should work fine for up to 10-20 colors.',
        )
        .arg(
          new Arg('number')
            .help('Number of distinct colors in the set')
            .action(ArgAction.Set)
            .defaultValue('10')
            .valueName('count'),
        )
        .arg(
          new Arg('metric')
            .long('metric')
            .short('m')
            .help(
              'Distance metric to compute mutual color distances. The CIEDE2000 is ' +
                'more accurate, but also much slower.',
            )
            .action(ArgAction.Set)
            .valueParser(['CIEDE2000', 'CIE76'])
            .valueName('name')
            .defaultValue('CIE76'),
        )
        .arg(
          new Arg('print-minimal-distance')
            .long('print-minimal-distance')
            .action(ArgAction.SetTrue)
            .help('Only show the optimized minimal distance')
            .hide(true),
        )
        .arg(
          new Arg('verbose')
            .long('verbose')
            .short('v')
            .action(ArgAction.SetTrue)
            .help('Print simulation output to STDERR'),
        )
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('sort-by')
        .about('Sort colors by the given property')
        .longAbout(
          'Sort a list of colors by the given property.\n\n' +
            'Example:\n  ' +
            'pastel random -n 20 | pastel sort-by hue | pastel format hex',
        )
        .alias('sort')
        .arg(new Arg('sort-order').help('Sort order').valueParser(SORT_OPTIONS).defaultValue(DEFAULT_SORT_ORDER))
        .arg(new Arg('reverse').long('reverse').short('r').action(ArgAction.SetTrue).help('Reverse the sort order'))
        .arg(
          new Arg('unique')
            .long('unique')
            .short('u')
            .action(ArgAction.SetTrue)
            .help('Remove duplicate colors (equality is determined via RGB values)'),
        )
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('pick')
        .about('Interactively pick a color from the screen (pipette)')
        .longAbout(
          'Print a spectrum of colors to choose from. This command requires an ' +
            'external color picker tool to be installed.\n' +
            '\n' +
            'Supported tools:\n  ' +
            '- gpick (https://github.com/thezbyg/gpick)\n  ' +
            '- xcolor (https://github.com/Soft/xcolor)\n  ' +
            '- wcolor (https://github.com/Elvyria/wcolor)\n  ' +
            '- grabc (https://www.muquit.com/muquit/software/grabc/grabc.html)\n  ' +
            '- colorpicker (https://github.com/Jack12816/colorpicker)\n  ' +
            '- chameleon (https://github.com/seebye/chameleon)\n  ' +
            '- KColorChooser (https://kde.org/applications/graphics/org.kde.kcolorchooser)\n  ' +
            '- zenity (https://wiki.gnome.org/Projects/Zenity)\n  ' +
            '- yad (https://github.com/v1cont/yad)\n  ' +
            '- hyprpicker (https://github.com/hyprwm/hyprpicker)\n  ' +
            '- macOS built-in color picker',
        )
        .arg(new Arg('count').help('Number of colors to pick').defaultValue('1')),
    )
    .subcommand(
      new Command('format')
        .about('Convert a color to the given format')
        .longAbout('Convert the given color(s) to a specific format.\n\n' + 'Example:\n  ' + 'pastel random -n 20 | pastel format rgb')
        .arg(
          new Arg('type')
            .help(
              "Output format type. Note that the 'ansi-*-escapecode' formats print " +
                'ansi escape sequences to the terminal that will not be visible ' +
                'unless something else is printed in addition.',
            )
            .valueParser([
              'rgb', 'rgb-float', 'rgb-r', 'rgb-g', 'rgb-b', 'hex',
              'hsl', 'hsl-hue', 'hsl-saturation', 'hsl-lightness',
              'hsv', 'hsv-hue', 'hsv-saturation', 'hsv-value',
              'lch', 'lch-lightness', 'lch-chroma', 'lch-hue',
              'oklch', 'oklch-lightness', 'oklch-chroma', 'oklch-hue',
              'lab', 'lab-a', 'lab-b',
              'oklab', 'oklab-l', 'oklab-a', 'oklab-b',
              'luminance', 'brightness',
              'ansi-8bit', 'ansi-24bit',
              'ansi-8bit-value',
              'ansi-8bit-escapecode', 'ansi-24bit-escapecode',
              'cmyk', 'name',
            ])
            .ignoreCase(true)
            .defaultValue('hex'),
        )
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('paint')
        .about('Print colored text using ANSI escape sequences')
        .arg(new Arg('color').help("The foreground color. Use '-' to read the color from STDIN.").required(true))
        .arg(
          new Arg('text')
            .help('The text to be printed in color. If no argument is given, ' + 'the input is read from STDIN.')
            .action(ArgAction.Append),
        )
        .arg(
          new Arg('on')
            .short('o')
            .long('on')
            .help('Use the specified background color')
            .action(ArgAction.Set)
            .valueName('bg-color'),
        )
        .arg(new Arg('bold').short('b').long('bold').action(ArgAction.SetTrue).help('Print the text in bold face'))
        .arg(new Arg('italic').short('i').long('italic').action(ArgAction.SetTrue).help('Print the text in italic font'))
        .arg(new Arg('underline').short('u').long('underline').action(ArgAction.SetTrue).help('Draw a line below the text'))
        .arg(
          new Arg('no-newline')
            .short('n')
            .long('no-newline')
            .action(ArgAction.SetTrue)
            .help('Do not print a trailing newline character'),
        ),
    )
    .subcommand(
      new Command('gradient')
        .about('Generate an interpolating sequence of colors')
        .longAbout(
          'Generate a sequence of colors that interpolates between the specified colors.\n' +
            'The interpolation is performed in the specified color space.\n\n' +
            'Example:\n  ' +
            'pastel gradient --colorspace=HSL ffffcc fd8d3c\n  ' +
            'pastel gradient 555ee4 white d84341 -n 15',
        )
        .arg(
          new Arg('color')
            .valueName('color')
            .help('Color stops in the color gradient')
            .action(ArgAction.Append)
            .required(true),
        )
        .arg(
          new Arg('number')
            .long('number')
            .short('n')
            .help('Number of colors to generate')
            .action(ArgAction.Set)
            .defaultValue('10')
            .valueName('count'),
        )
        .arg(colorspaceArg.clone()),
    )
    .subcommand(
      new Command('mix')
        .about('Mix two colors in the given colorspace')
        .longAbout(
          'Create new colors by interpolating between two colors in the given colorspace.\n\n' +
            'Example:\n  ' +
            'pastel mix --colorspace=RGB red blue',
        )
        .arg(colorspaceArg.clone())
        .arg(
          new Arg('fraction')
            .long('fraction')
            .short('f')
            .help('The number between 0.0 and 1.0 determining how much to ' + 'mix in from the base color.')
            .action(ArgAction.Set)
            .defaultValue('0.5'),
        )
        .arg(
          new Arg('base')
            .valueName('color')
            .help('The base color which will be mixed with the other colors')
            .required(true),
        )
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('colorblind')
        .about('Simulate a color under a certain colorblindness profile')
        .longAbout(
          'Convert the given color to how it would look to a person with protanopia, ' +
            'deuteranopia, or tritanopia \n\n' +
            'Example:\n  ' +
            'pastel distinct 3 | pastel colorblind deuter',
        )
        .arg(
          new Arg('type')
            .help('The type of colorblindness that should be simulated (protanopia, ' + 'deuteranopia, tritanopia)')
            .valueParser(['prot', 'deuter', 'trit'])
            .ignoreCase(true)
            .required(true),
        )
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('set')
        .about('Set a color property to a specific value')
        .longAbout('Set the given property to a specific value\n' + 'Example:\n  ' + 'pastel random | pastel set luminance 0.9')
        .arg(
          new Arg('property')
            .help('The property that should be changed')
            .valueParser([
              'lightness', 'hue', 'chroma',
              'lab-a', 'lab-b',
              'oklab-l', 'oklab-a', 'oklab-b',
              'red', 'green', 'blue',
              'hsl-hue', 'hsl-saturation', 'hsl-lightness',
              'alpha',
            ])
            .ignoreCase(true)
            .required(true),
        )
        .arg(new Arg('value').help('The new numerical value of the property').required(true))
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('saturate')
        .longAbout(
          'Increase the saturation of a color by adding a certain amount to the HSL ' +
            'saturation channel. If the amount is negative, the color will be desaturated ' +
            'instead.',
        )
        .about('Increase color saturation by a specified amount')
        .arg(new Arg('amount').help('Amount of saturation to add (number between 0.0 and 1.0)').required(true))
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('desaturate')
        .longAbout(
          'Decrease the saturation of a color by subtracting a certain amount from the ' +
            'HSL saturation channel. If the amount is negative, the color will be saturated ' +
            'instead.',
        )
        .about('Decrease color saturation by a specified amount')
        .arg(new Arg('amount').help('Amount of saturation to subtract (number between 0.0 and 1.0)').required(true))
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('lighten')
        .longAbout(
          'Lighten a color by adding a certain amount to the HSL lightness channel. ' +
            'If the amount is negative, the color will be darkened.',
        )
        .about('Lighten color by a specified amount')
        .arg(new Arg('amount').help('Amount of lightness to add (number between 0.0 and 1.0)').required(true))
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('darken')
        .longAbout(
          'Darken a color by subtracting a certain amount from the lightness channel. ' +
            'If the amount is negative, the color will be lightened.',
        )
        .about('Darken color by a specified amount')
        .arg(new Arg('amount').help('Amount of lightness to subtract (number between 0.0 and 1.0)').required(true))
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('rotate')
        .about('Rotate the hue channel by the specified angle')
        .longAbout(
          'Rotate the HSL hue channel of a color by the specified angle (in ' +
            'degrees). A rotation by 180° returns the complementary color. A ' +
            'rotation by 360° returns to the original color.',
        )
        .arg(new Arg('degrees').help('angle by which to rotate (in degrees, can be negative)').required(true))
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('complement')
        .about('Get the complementary color (hue rotated by 180°)')
        .longAbout('Compute the complementary color by rotating the HSL hue channel by 180°.')
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('gray')
        .about('Create a gray tone from a given lightness')
        .longAbout('Create a gray tone from a given lightness value.')
        .arg(new Arg('lightness').help('Lightness of the created gray tone (number between 0.0 and 1.0)').required(true)),
    )
    .subcommand(
      new Command('to-gray')
        .about('Completely desaturate a color (preserving luminance)')
        .longAbout(
          'Completely desaturate the given color while preserving the luminance.\n' +
            '\n' +
            "For a definition of 'luminance', see:\n\n  " +
            'https://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef',
        )
        .arg(colorArg.clone()),
    )
    .subcommand(
      new Command('textcolor')
        .about('Get a readable text color for the given background color')
        .longAbout(
          'Return a readable foreground text color (either black or white) for a ' +
            'given background color. This can also be used in the opposite way, ' +
            'i.e. to create a background color for a given text color.',
        )
        .arg(colorArg.clone()),
    )
    .subcommand(new Command('colorcheck').about('Check if your terminal emulator supports 24-bit colors.'))
    .arg(
      new Arg('color-mode')
        .long('color-mode')
        .short('m')
        .valueName('mode')
        .help('Specify the terminal color mode: 24bit, 8bit, off, *auto*')
        .valueParser(['24bit', '8bit', 'off', 'auto'])
        .defaultValue('auto')
        .hidePossibleValues(true)
        .hideDefaultValue(true),
    )
    .arg(
      new Arg('force-color')
        .short('f')
        .long('force-color')
        .action(ArgAction.SetTrue)
        .help('Alias for --mode=24bit'),
    )
    .arg(
      new Arg('color-picker')
        .long('color-picker')
        .action(ArgAction.Set)
        .valueParser([...COLOR_PICKER_TOOL_NAMES])
        .ignoreCase(true)
        .help('Use a specific tool to pick the colors'),
    );
}
