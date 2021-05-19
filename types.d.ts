type TileState = 'default' | 'pushed' | 
  'detonated' | 'wrong' | 'question' | 
  'flagged'   | 'mine'  | 'cleared'
type GameState = 'created' | 'starting' | 
   'running' | 'won' | 'lost' | 'idle'
interface FieldEvent {
  x: number
  y: number
  type: string
  button: number
}

