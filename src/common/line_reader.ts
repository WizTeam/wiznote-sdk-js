class LineReader {
  lines: string[];
  index: number;
  constructor(text: string) {
    this.lines = text.split('\n');
    this.index = 0;
  }

  //
  readLine(): string | null {
    if (this.index >= this.lines.length) {
      return null;
    }
    //
    const line = this.lines[this.index];
    this.index++;
    return line;
  }
}

export default LineReader;
