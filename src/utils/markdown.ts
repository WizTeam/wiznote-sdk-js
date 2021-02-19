import marked, { Token } from 'marked';

function getAllImagesFromMarkdown(md: string) {
  const tokens = marked.lexer(md);
  console.log(tokens);
  //
  const findImages = (tokens: Token[], images: {
    raw: string,
    src: string,
  }[]) => {
    tokens.forEach((token) => {
      if ((token as any).type === 'image') {
        images.push({
          raw: token.raw,
          src: (token as any).href,
        });
      }
      //
      if  ((token as any).tokens) {
        findImages((token as any).tokens, images);
      }
    });
  }
  //
  const images: {
    raw: string,
    src: string,
  }[] = [];
  findImages(tokens, images);
  //
  console.log(images);
  //
  return images;
}

export {
  getAllImagesFromMarkdown,
};
