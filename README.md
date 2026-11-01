# pastel

[![Build Status](https://img.shields.io/github/actions/workflow/status/sharkdp/pastel/CICD.yml?style=flat-square)](https://github.com/sharkdp/pastel/actions)
[![](https://img.shields.io/github/v/release/sharkdp/pastel?colorB=d7a400&style=flat-square)](https://github.com/sharkdp/pastel/releases)
![](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-ff7155?style=flat-square)


`pastel` is a command-line tool to generate, analyze, convert and manipulate colors. It supports many different color formats and color spaces like RGB (sRGB), HSL, CIELAB, CIELCh as well as ANSI 8-bit and 24-bit representations.

This is the JavaScript (Node.js) edition of `pastel`: the command line, its output and its error messages
are the same as those of `pastel` v0.12.0. It needs Node.js 22 or newer and has no dependencies besides
the Node.js standard library.

## In action

![pastel in action](doc/pastel.gif)

## Tutorial

### Getting help

`pastel` provides a number of commands like `saturate`, `mix` or `paint`. To see a complete list, you can simply run
``` bash
pastel
```
To get more information about a specific subcommand (say `mix`), you can call `pastel mix -h` or `pastel help mix`.

### Composition

Many `pastel` commands can be composed by piping the output of one command to another, for example:
``` bash
pastel random | pastel mix red | pastel lighten 0.2 | pastel format hex
```

### Specifying colors

Colors can be specified in many different formats:
```
lightslategray
'#778899'
778899
789
'rgb(119, 136, 153)'
'119,136,153'
'hsl(210, 14.3%, 53.3%)'
```

Colors can be passed as positional arguments, for example:
```
pastel lighten 0.2 orchid orange lawngreen
```
They can also be read from standard input. So this is equivalent:
```
printf "%s\n" orchid orange lawngreen | pastel lighten 0.2
```
You can also explicitly specify which colors you want to read from the input. For example, this mixes `red` (which is read from STDIN) with `blue` (which is passed on the command line):
```
pastel color red | pastel mix - blue
```

### Use cases and demo

#### Converting colors from one format to another

``` bash
pastel format hsl ff8000
```

#### Show and analyze colors on the terminal

``` bash
pastel color "rgb(255,50,127)"

pastel color 556270 4ecdc4 c7f484 ff6b6b c44d58
```

#### Pick a color from somewhere on the screen

``` bash
pastel pick
```

#### Generate a set of N visually distinct colors

```
pastel distinct 8
```

#### Get a list of all X11 / CSS color names

``` bash
pastel list
```

#### Name a given color

``` bash
pastel format name 44cc11
```

#### Print colorized text from a shell script

``` bash
bg="hotpink"
fg="$(pastel textcolor "$bg")"

pastel paint "$fg" --on "$bg" "well readable text"
```

``` bash
pastel paint -n black --on red --bold "   ERROR!   "
echo " A serious error"

pastel paint -n black --on yellow --bold "  WARNING!  "
echo " A warning message"

pastel paint -n black --on limegreen --bold "    INFO    "
echo -n " Informational message with a "
echo -n "highlighted" | pastel paint -n default --underline
echo " word"
```

## Installation

`pastel` needs [Node.js](https://nodejs.org/) 22 or newer. It has no npm dependencies, so there is
nothing to build. Install it from a checkout of this repository with npm, which puts the `pastel`
command on your `PATH`:
```
git clone https://github.com/sharkdp/pastel
cd pastel
npm install --global .
```

You can also run it in place without installing anything:
```
node bin/pastel.js format hsl ff8000
```

The package tarballs attached to the [release page](https://github.com/sharkdp/pastel/releases) can be
installed the same way (`npm install --global ./pastel-0.12.0.tgz`).

## Development

The library lives in `src/lib` (color spaces, the color parser, ANSI support, distinct colors) and the
command line in `src/cli` (argument parsing, help texts and the subcommands). Run the tests with
```
npm test
```

`src/lib/pow.js` is a port of the `pow` function of
[Arm Optimized Routines](https://github.com/ARM-software/optimized-routines), used under its MIT licence
(the notice is at the top of that file).

## Resources

Interesting Wikipedia pages:

* [Color difference](https://en.wikipedia.org/wiki/Color_difference)
* [CIE 1931 color space](https://en.wikipedia.org/wiki/CIE_1931_color_space)
* [CIELAB color space](https://en.wikipedia.org/wiki/CIELAB_color_space)
* [Line of purples](https://en.wikipedia.org/wiki/Line_of_purples)
* [Impossible color](https://en.wikipedia.org/wiki/Impossible_color)
* [sRGB](https://en.wikipedia.org/wiki/SRGB)
* [Color theory](https://en.wikipedia.org/wiki/Color_theory)
* [Eigengrau](https://en.wikipedia.org/wiki/Eigengrau)

Color names:

* [XKCD Color Survey Results](https://blog.xkcd.com/2010/05/03/color-survey-results/)
* [Peachpuffs and Lemonchiffons - talk about named colors](https://www.youtube.com/watch?v=HmStJQzclHc)
* [List of CSS color keywords](https://www.w3.org/TR/SVG11/types.html#ColorKeywords)

Maximally distinct colors:

* [How to automatically generate N "distinct" colors?](https://stackoverflow.com/q/470690/704831)
* [Publication on two algorithms to generate (maximally) distinct colors](http://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.65.2790)

Other articles and videos:

* [Color Matching](https://www.youtube.com/watch?v=82ItpxqPP4I)
* [Introduction to color spaces](https://ciechanow.ski/color-spaces/)

## License

Licensed under either of

 * Apache License, Version 2.0, ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
 * MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.
