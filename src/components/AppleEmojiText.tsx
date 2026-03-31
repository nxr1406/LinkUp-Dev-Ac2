import React from 'react';
import emoji from 'react-easy-emoji';

interface AppleEmojiTextProps {
  text: string;
  className?: string;
}

export function AppleEmojiText({ text, className }: AppleEmojiTextProps) {
  return (
    <span className={className}>
      {emoji(text, (code, string, offset) => (
        <img
          key={offset}
          alt={string}
          src={`https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${code}.png`}
          className="inline-block w-[1.2em] h-[1.2em] mx-[0.05em] align-[-0.2em]"
          draggable={false}
        />
      ))}
    </span>
  );
}
