import './ui/styles.css';
import { Game } from './Game';

const root = document.getElementById('app')!;
const game = new Game(root);
(window as unknown as { __afterlight: Game }).__afterlight = game;
