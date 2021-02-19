import marked, { Token } from 'marked';

function getAllImagesFromMarkdown(md: string) {
  const tokens = marked.lexer(md);
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
      const children = (token as any).tokens;
      if  (children && Array.isArray(children)) {
        findImages(children, images);
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
