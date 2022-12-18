import { Signal, ISignal } from '@lumino/signaling';
import { Message, IMessageHandler } from '@lumino/messaging';
import {
  DataGrid,
  JSONModel,
  BasicKeyHandler,
  BasicMouseHandler,
  BasicSelectionModel,
  SelectionModel
} from '@lumino/datagrid';
import { ITimeMeasurement } from './benchmark';
import { IRuleDescription } from './css';

import { Statistic } from './statistics';

class MouseHandler extends BasicMouseHandler {
  get clicked(): ISignal<this, DataGrid.HitTestResult> {
    return this._clicked;
  }

  onMouseDown(grid: DataGrid, event: MouseEvent): void {
    const { clientX, clientY } = event;
    const hit = grid.hitTest(clientX, clientY);
    this._lastMouseDownHit = hit;
    super.onMouseDown(grid, event);
  }

  onMouseUp(grid: DataGrid, event: MouseEvent): void {
    const lastHit = this._lastMouseDownHit;
    if (lastHit) {
      const { clientX, clientY } = event;
      const hit = grid.hitTest(clientX, clientY);

      if (lastHit.column === hit.column && lastHit.row === hit.row) {
        this._clicked.emit(hit);
      }
    }

    super.onMouseUp(grid, event);
  }

  onMouseMove(grid: DataGrid, event: MouseEvent): void {
    // cancel click to allow smooth resize
    this._lastMouseDownHit = null;
    super.onMouseMove(grid, event);
  }

  private _clicked = new Signal<this, DataGrid.HitTestResult>(this);
  private _lastMouseDownHit: DataGrid.HitTestResult | null = null;
}

export abstract class ResultTable extends DataGrid {
  abstract readonly columnWidths: Record<string, number>;
  columnNames: string[];

  constructor() {
    super();
    this.keyHandler = new BasicKeyHandler();
    const mouseHandler = new MouseHandler();
    this.mouseHandler = mouseHandler;
    this.columnNames = [];
    mouseHandler.clicked.connect((_, hit) => {
      this.handleClick(hit);
    });
  }

  abstract handleClick(hit: DataGrid.HitTestResult): void;

  protected setupColumnWidths(): void {
    this.fitColumnNames('all');
    for (const [name, size] of Object.entries(this.columnWidths)) {
      const index = this.columnNames.indexOf(name);
      if (index !== -1) {
        this.resizeColumn('body', index, size);
      }
    }
  }
}

interface ITimingTableOptions {
  measurements: ITimeMeasurement[];
  reference?: number[];
  stateSource: any;
  /**
   * Worse results will be shown at the top of the table.
   */
  lowerIsBetter: boolean;
  sortColumn?: string;
}

export class TimingTable extends ResultTable {
  readonly columnWidths: Record<string, number> = {
    source: 325,
    content: 100,
    selector: 175,
    rulesInBlock: 450,
    IQM: 55,
    min: 55,
    ΔIQM: 0,
    'ΔIQM%': 60,
    Q1: 55,
    ΔQ1: 0,
    'ΔQ1%': 55,
    name: 150,
    resource: 500
  };
  stateSource: any;
  constructor(options: ITimingTableOptions) {
    super();
    this.stateSource = options.stateSource;
    const anyErrors = options.measurements.some(
      result => result.errors != null && result.errors.length !== 0
    );
    const results = options.measurements.map(result => {
      // Make a copy
      result = { ...result };
      // https://github.com/jupyterlab/lumino/issues/448
      if (result['content']) {
        result['content'] = result['content'].substring(0, 500);
      }
      result['times'] = result.times.map(t => Statistic.round(t, 1));
      result['min'] = Statistic.round(Statistic.min(result.times), 1);
      result['mean'] = Statistic.round(Statistic.mean(result.times), 1);
      result['Q1'] = Statistic.round(Statistic.quartile(result.times, 1), 1);
      result['IQM'] = Statistic.round(
        Statistic.interQuartileMean(result.times),
        1
      );
      if (options.reference) {
        const referenceIQM = Statistic.interQuartileMean(options.reference);
        result['ΔIQM'] = Statistic.round(
          Statistic.interQuartileMean(result.times) - referenceIQM,
          1
        );
        result['ΔIQM%'] = Statistic.round(
          (100 * result['ΔIQM']) / referenceIQM,
          1
        );
        const referenceQ1 = Statistic.quartile(options.reference, 1);
        result['ΔQ1'] = Statistic.round(
          Statistic.quartile(result.times, 1) - referenceQ1,
          1
        );
        result['ΔQ1%'] = Statistic.round(
          (100 * result['ΔQ1']) / referenceQ1,
          1
        );
      }
      if (result.source) {
        result['source'] = result['source']
          .replace('webpack://./', '')
          .replace('node_modules', '📦');
      }
      if (result['totalTime']) {
        result['totalTime'] = Statistic.round(result.totalTime, 1);
      }
      if (result['rulesInBlock']) {
        result['rulesInBlock'] = (
          result['rulesInBlock'] as IRuleDescription[]
        ).map(rule => {
          return rule.selector;
        });
      }
      if (!anyErrors) {
        delete result['errors'];
      }
      return result;
    });
    this.results = results;
    this.columnNames = results.length > 0 ? Object.keys(results[0]) : [];
    this.sortColumn = options.sortColumn || 'Q1';
    this.sortOrder = options.lowerIsBetter ? 'ascending' : 'descending';
    this._setupDataModel();
    this.setupColumnWidths();
  }

  messageHook(handler: IMessageHandler, msg: Message): boolean {
    const reply = super.messageHook(handler, msg);
    if (msg.type === 'resize' || msg.type === 'column-resize-request') {
      if (this._squeezeOngoing) {
        this._squeezeOngoing = false;
      } else {
        this._squeezeColumsIfNeeded();
      }
    }
    return reply;
  }

  /**
   * Reduce size of the largest column if the table does not fit.
   */
  private _squeezeColumsIfNeeded() {
    const scaleDownFactor = 0.8;
    let maxSize = 0;
    let totalSize = 0;
    let largest: number | null = null;
    for (let i = 0; i < this.columnNames.length; i++) {
      const size = this.columnSize('body', i);
      totalSize += size;
      if (size > maxSize) {
        largest = i;
        maxSize = size;
      }
    }
    if (largest == null) {
      return;
    }
    const name = this.columnNames[largest];
    const defaultSize = this.columnWidths[name];
    if (defaultSize == null) {
      // this column width was not pre-defined
      return;
    }
    const reducedSize = Math.round(defaultSize * scaleDownFactor);
    if (maxSize !== defaultSize && maxSize !== reducedSize) {
      // column was resized by user or not yet set up
      return;
    }
    if (this.pageWidth === 0) {
      // page width not known yet
      return;
    }
    this._squeezeOngoing = true;
    if (totalSize > this.pageWidth) {
      this.resizeColumn('body', largest, reducedSize);
    } else {
      const increase = defaultSize - reducedSize;
      if (totalSize + increase < this.pageWidth) {
        this.resizeColumn('body', largest, defaultSize);
      }
    }
  }

  private _createSortFunction() {
    const first = this.results.length > 0 ? this.results[0] : null;
    if (first !== null && typeof first[this.sortColumn] === 'number') {
      if (this.sortOrder === 'ascending') {
        return ((a: ITimeMeasurement, b: ITimeMeasurement) =>
          b[this.sortColumn] - a[this.sortColumn]).bind(this);
      } else {
        return ((a: ITimeMeasurement, b: ITimeMeasurement) =>
          a[this.sortColumn] - b[this.sortColumn]).bind(this);
      }
    } else {
      if (this.sortOrder === 'ascending') {
        return ((a: ITimeMeasurement, b: ITimeMeasurement) =>
          (b[this.sortColumn] || '')
            .toString()
            .localeCompare((a[this.sortColumn] || '').toString())).bind(this);
      } else {
        return ((a: ITimeMeasurement, b: ITimeMeasurement) =>
          (a[this.sortColumn] || '')
            .toString()
            .localeCompare((b[this.sortColumn] || '').toString())).bind(this);
      }
    }
  }

  private _setupDataModel(keepColumnSize = false): void {
    let sizes: number[] = [];
    let selectionArgs: SelectionModel.SelectArgs | null = null;
    if (this.selectionModel) {
      const selection = this.selectionModel.currentSelection();
      if (selection) {
        selectionArgs = {
          cursorColumn: this.selectionModel.cursorColumn,
          cursorRow: this.selectionModel.cursorRow,
          clear: 'all',
          ...selection
        };
      }
    }
    if (keepColumnSize) {
      sizes = this.columnNames.map((name, i) => this.columnSize('body', i));
    }
    const sort = this._createSortFunction();
    this.dataModel = new JSONModel({
      data: this.results.sort(sort),
      schema: {
        fields: this.columnNames.map(key => {
          return {
            name: key,
            type: 'string'
          };
        })
      }
    });
    this.selectionModel = new BasicSelectionModel({
      dataModel: this.dataModel
    });
    if (keepColumnSize) {
      sizes.map((size, index) => {
        this.resizeColumn('body', index, size);
      });
    }
    if (selectionArgs) {
      this.selectionModel.select(selectionArgs);
    }
  }

  handleClick(hit: DataGrid.HitTestResult): void {
    if (hit.region === 'column-header') {
      const newSortColumn = this.dataModel!.data(
        hit.region,
        hit.row,
        hit.column
      );
      if (newSortColumn === this.sortColumn) {
        this.sortOrder =
          this.sortOrder === 'ascending' ? 'descending' : 'ascending';
      } else {
        this.sortColumn = newSortColumn;
      }
      this._setupDataModel(true);
      this.update();
    }
  }
  protected results: ITimeMeasurement[];
  protected sortColumn: string;
  protected sortOrder: 'ascending' | 'descending' = 'ascending';
  private _squeezeOngoing = false;
}
