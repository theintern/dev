import { renderSync } from 'node-sass';
import { writeFileSync } from 'fs';
import { mkdir } from 'shelljs';

const result = renderSync({
	file: 'src/styles/style.scss',
	// outputStyle: 'compressed',
	sourceMap: true,
	sourceMapContents: true
});

mkdir('-p', '_build/src/assets/css');
writeFileSync('_build/src/assets/css/style.css', result.css);
writeFileSync('_build/src/assets/css/style.css.map', result.css.map);
