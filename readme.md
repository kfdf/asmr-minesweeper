## ASMR Minesweeper

A minesweeper version written in Javascript. Uses canvas for rendering and thread like constructs for control flow. It can be played [here](https://kfdf.github.io/asmr-minesweeper).

Left-clicking on a covered cell reveals it. Right-clicking flags it. A left-click on a revealed "numbered" cell reveals all adjacent covered cells if the number in the cell equals to the number of flags in the surrounding cells. Same with right-clicking on a "numbered" cell, if the number of adjacent covered cells equals to the number in the cell, they are flagged.

The helper function repeatedly applies left and right clicks to all "numbered" cells until it can go no further. So it can be used advance the position until there are no more obvious moves left. 

The autoplay function alternates between revealing a random cell and using the helper. The algorithm is very simple, but it can occasionaly win easier boards. When the game ends, it is automatically restarted. So the game can be observed playing itself, giving it its name. 

The helper and autoplay can be started and interrupted at any time.
