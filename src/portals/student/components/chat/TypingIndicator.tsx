import React from 'react';
import Lottie from 'lottie-react';

const typingAnimation = {
  v: "5.5.7",
  fr: 30,
  ip: 0,
  op: 60,
  w: 100,
  h: 100,
  nm: "typing",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "dot1",
      sr: 1,
      ks: {
        o: { a: 1, k: [
          { i: { x: [0.833], y: [0.833] }, o: { x: [0.167], y: [0.167] }, t: 0, s: [100] },
          { i: { x: [0.833], y: [0.833] }, o: { x: [0.167], y: [0.167] }, t: 10, s: [30] },
          { i: { x: [0.833], y: [0.833] }, o: { x: [0.167], y: [0.167] }, t: 20, s: [100] },
          { t: 60, s: [100] }
        ], ix: 11 },
        p: { a: 0, k: [25, 50, 0], ix: 2 },
        s: { a: 0, k: [100, 100, 100], ix: 6 }
      },
      ao: 0,
      shapes: [
        {
          ty: "el",
          p: { a: 0, k: [0, 0], ix: 3 },
          s: { a: 0, k: [8, 8], ix: 2 },
          fillColor: [0.4, 0.4, 0.4, 1]
        }
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0
    }
  ],
  markers: []
};

const TypingIndicator: React.FC = () => {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-muted p-3 rounded-2xl mr-4 flex items-center space-x-2 rounded-bl-md">
        <div className="w-8 h-8">
          <Lottie 
            animationData={typingAnimation}
            loop={true}
            className="w-full h-full"
          />
        </div>
        <span className="text-sm text-muted-foreground">AI is typing...</span>
      </div>
    </div>
  );
};

export default TypingIndicator;