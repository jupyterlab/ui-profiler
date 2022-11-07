import { Signal, ISignal } from '@lumino/signaling';
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
  readonly columnWidths = {
    source: 325,
    content: 100,
    selector: 175,
    rulesInBlock: 450,
    IQM: 55,
    min: 55,
    Δ: 55,
    'Δ%': 55,
    name: 150,
    resource: 500
  };
  stateSource: any;
  constructor(options: ITimingTableOptions) {
    super();
    this.stateSource = options.stateSource;
    const referenceIQM = options.reference
      ? Statistic.interQuartileMean(options.reference)
      : null;
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
      result['IQM'] = Statistic.round(
        Statistic.interQuartileMean(result.times),
        1
      );
      if (referenceIQM !== null) {
        result['Δ'] = Statistic.round(
          Statistic.interQuartileMean(result.times) - referenceIQM,
          1
        );
        result['Δ%'] = Statistic.round((100 * result['Δ']) / referenceIQM, 1);
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
    this.sortColumn = options.sortColumn || 'IQM';
    this.sortOrder = options.lowerIsBetter ? 'ascending' : 'descending';
    this._setupDataModel();
    this.setupColumnWidths();
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
}
