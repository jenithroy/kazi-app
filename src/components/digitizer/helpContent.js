/**
 * What the help (Help.jsx, the "?" button) shows: every feature of the digitizer, with a short video of it (public/videos/digitizer/<id>.mp4
 * and .webm, recorded from this page itself) and a few plain words. The explanations that used to sit under every button are here instead.
 * The first-visit tour (Tour.jsx) is a separate, shorter walk through the screen.
 *
 * `video` is the file name without its extension; `poster` is the same name as a .jpg (the first frame, shown while the video loads).
 */
export const HELP = [
  {
    group: "Getting started",
    items: [
      {
        id: "add-picture",
        title: "Add a picture",
        text: "Drop a logo or a photo on the canvas, paste it with Ctrl+V, or press Choose a picture. It is read on your own device and turned into one shape for each colour. Nothing is uploaded. No picture to hand? Try the Kazi logo.",
      },
      {
        id: "three-steps",
        title: "The three steps",
        text: "Picture is how the picture is turned into shapes. Design is where you move, resize and recolour shapes and add text. Stitches shows the real stitches, lets you watch them being sewn, and saves the file for your machine.",
      },
    ],
  },
  {
    group: "Picture",
    items: [
      {
        id: "colours-detail",
        title: "Colours and detail",
        text: "Colours: up to 12 is what a machine head can hold. Auto uses only as many as the picture needs. Detail: Simple leaves out small specks; Finest keeps pieces down to 0.3 mm², the smallest a needle can sew, but means more stitches, trims and time. Faces, leaves and lettering keep more detail when the design is bigger.",
      },
      {
        id: "my-threads",
        title: "My threads",
        text: "Add the threads you have, and the picture is made in those colours only: each colour of it goes to the nearest of your threads. Press a thread to take it away, or switch Use only my threads off to go back to the picture's own colours. With none added the picture keeps its own colours. Your list is remembered on this computer.",
      },
      {
        id: "background-cloth",
        title: "Background and cloth",
        text: "Leave out the background: the colour of the page round a logo is not stitched. Switch it off and the whole picture is stitched. Cloth is the colour of the garment, only for looking at the design (it is not saved in the stitch file). Every colour of the picture is stitched, white on a white cloth too: delete the shapes you do not want.",
      },
      {
        id: "crop-size",
        title: "Crop and size",
        text: "Crop cuts away what you do not want: drag the white handles on the canvas, then press Done cropping. Width sets how big the picture is in millimetres. Make it fill the hoop makes it as big as the hoop allows and reads it again at that size, which keeps more detail.",
      },
    ],
  },
  {
    group: "Design",
    items: [
      {
        id: "move-resize",
        title: "Move, resize and turn",
        text: "Select a shape and drag it. Drag a corner to resize, the round handle to turn it. Type exact numbers in the panel for position, size and turn. Shift+click adds shapes to the selection; the arrow keys nudge it (hold Shift for 1 mm).",
        keys: ["V select", "Arrows nudge", "Ctrl+D copy", "Delete remove"],
      },
      {
        id: "text",
        title: "Add text",
        text: "Choose the Text tool and click where the words go (or press Enter for the middle of the hoop). Type the words in the panel, then pick a font, size and colour. Split into letters moves them one by one. A warning tells you when lettering is too small to sew clearly.",
        keys: ["T text"],
      },
      {
        id: "shapes-trace",
        title: "Shapes and trace by hand",
        text: "Rectangle and Ellipse: click or drag on the hoop. Trace by hand: click round the edge of a part of the picture, then click the first point or press Enter to close the shape. It takes the colour the picture has under it. Good for small details the automatic conversion leaves out.",
        keys: ["R rectangle", "O ellipse", "P trace by hand"],
      },
      {
        id: "objects-list",
        title: "The Objects list",
        text: "Everything in the design, in the order it is sewn. Click to select (Shift or Ctrl to add more), drag a row to change when it is sewn, use the eye to hide a shape and the padlock to keep it from being moved. Double-click a name (or press F2) to rename it. Right-click for more.",
      },
    ],
  },
  {
    group: "Stitches and files",
    items: [
      {
        id: "stitches-play",
        title: "Watch it being sewn",
        text: "The Stitches step shows the real stitches. Press play to watch the design being sewn, drag the slider to any moment, and choose the speed. Show jumps marks the long moves between pieces; Show crowded spots rings places where many needle holes lie close together.",
      },
      {
        id: "save-files",
        title: "Save the stitch file",
        text: "Download DST works on Tajima, Barudan, ZSK, SWF and most industrial machines. The Stitches step also saves PES (Brother, Babylock), EXP (Melco, Bernina), JEF (Janome), VP3 (Husqvarna Viking, Pfaff) and XXX. Save design keeps your work to edit later, and Open opens a saved design or any machine file.",
        keys: ["Ctrl+S save design"],
      },
    ],
  },
  {
    group: "Tips",
    items: [
      {
        id: "view-keys",
        title: "Zoom, move and keys",
        text: "Scroll to zoom, and hold Space and drag (or use the Hand tool) to move around. F fits the hoop in the window. The grid and the rulers can be switched on and off in the zoom box. Ctrl+Z undoes, Ctrl+Y does it again.",
        keys: ["Scroll zoom", "Space+drag move", "F fit", "H hand", "Ctrl+Z undo"],
      },
    ],
  },
];

export const HELP_ITEMS = HELP.flatMap((g) => g.items);
