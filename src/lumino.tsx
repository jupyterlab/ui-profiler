import { Widget } from '@lumino/widgets';
import React from 'react';

interface ILuminoWidget {
  widget: Widget;
}

export const LuminoWidget = (props: ILuminoWidget): JSX.Element => {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const widget = props.widget;
    Widget.attach(widget, ref.current!);
    function updateSize() {
      props.widget.fit();
    }
    const observer = new ResizeObserver(entries => {
      updateSize();
    });
    observer.observe(ref.current!);
    return () => {
      Widget.detach(widget);
      observer.disconnect();
    };
  }, [props.widget]);

  return <div className="up-LuminoWidgetWrapper" ref={ref}></div>;
};
