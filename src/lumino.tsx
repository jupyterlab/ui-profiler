import { Widget } from '@lumino/widgets';
import React from 'react';

interface ILuminoWidget {
  widget: Widget;
}

export const LuminoWidget = (props: ILuminoWidget) => {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const widget = props.widget;
    //
    Widget.attach(widget, ref.current!);
    return () => {
      Widget.detach(widget);
    };
  }, [props.widget]);

  React.useLayoutEffect(() => {
    function updateSize() {
      props.widget.fit();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  return <div ref={ref}></div>;
};
