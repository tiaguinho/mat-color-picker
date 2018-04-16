import {
  AfterContentInit,
  Component,
  ContentChildren,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  EventEmitter,
  Input,
  Inject,
  Output,
  OnInit,
  OnDestroy,
  QueryList,
} from '@angular/core';
import { coerceBooleanProperty } from '@angular/cdk/coercion';
import { MccColorPickerCollectionComponent } from './color-picker-collection.component';
import { MccColorPickerService } from './color-picker.service';
import { EMPTY_COLOR, coerceHexaColor } from './color-picker';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Subscription } from 'rxjs/Subscription';
import { Observable } from 'rxjs/Observable';

@Component({
  selector: 'mcc-color-picker',
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.scss'],
  preserveWhitespaces: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MccColorPickerComponent implements AfterContentInit, OnInit, OnDestroy {
  /**
   * Get all collections
   */
  @ContentChildren(MccColorPickerCollectionComponent)
  _collections: QueryList<MccColorPickerCollectionComponent>;

  /**
   * Change label of the collection UsedColors
   */
  @Input()
  get usedColorLabel(): string {
    return this._usedColorLabel;
  }
  set usedColorLabel(value: string) {
    this._usedColorLabel = value;
  }
  private _usedColorLabel: string = 'Used Colors';

  /**
   * Set initial value for used color
   */
  @Input()
  set usedColorStart(colors: string[]) {
    if (colors && colors.length > 0) {
      for (const color of colors) {
        this.colorPickerService.addColor(color);
      }
    }
  }

  /**
   * Hide empty slots from the collection UsedColors
   */
  @Input('hideEmptyUsedColors')
  get hideEmpty(): boolean {
    return this._hideEmpty;
  }
  set hideEmpty(value: boolean) {
    this._hideEmpty = coerceBooleanProperty(value);
  }
  private _hideEmpty: boolean = false;

  /**
   * Hide transparent option of UsedColors
   */
  @Input('hideTransparentUsedColors')
  get hideTransparent(): boolean {
    return this._hideTransparent;
  }
  set hideTransparent(value: boolean) {
    this._hideTransparent = coerceBooleanProperty(value);
  }
  private _hideTransparent: boolean = false;

  /**
   * Hide UsedColors collection
   */
  @Input('hideUsedColors')
  get hideUsedColors(): boolean {
    return this._hideUsedColors;
  }
  set hideUsedColors(value: boolean) {
    this._hideUsedColors = coerceBooleanProperty(value);
  }
  private _hideUsedColors: boolean = false;

  /**
   * Start with a color selected
   */
  @Input()
  get selectedColor(): string {
    return this._selectedColor;
  }
  set selectedColor(value: string) {
    if (this._selectedColor !== value) {
      this.changeDetectorRef.markForCheck();
    }

    this._selectedColor = coerceHexaColor(value) || this.emptyColor;
  }
  private _selectedColor: string;

  /**
   * Define if the panel will be initiated open
   */
  @Input()
  get isOpen(): boolean {
    return this._isOpen;
  }
  set isOpen(value: boolean) {
    this._isOpen = coerceBooleanProperty(value);
  }
  private _isOpen: boolean = false;

  /**
   * Define if the panel will show in overlay or not
   */
  @Input()
  get overlay(): boolean {
    return this._overlay;
  }
  set overlay(value: boolean) {
    this._overlay = coerceBooleanProperty(value);
  }
  private _overlay: boolean = true;

  /**
   * Hide the action buttons (cancel/confirm)
   */
  @Input()
  get hideButtons(): boolean {
    return this._hideButtons;
  }
  set hideButtons(value: boolean) {
    this._hideButtons = coerceBooleanProperty(value);
  }
  private _hideButtons: boolean = false;


  /**
   * Hide the color picker selector
   */
  @Input()
  get hideColorPickerSelector(): boolean {
    return this._hideColorPickerSelector;
  }
  set hideColorPickerSelector(value: boolean) {
    this._hideColorPickerSelector = coerceBooleanProperty(value);
  }
  private _hideColorPickerSelector: boolean = false;

  /**
   * Set the size of the used colors
   */
  @Input() usedSizeColors: number = 30;

  /**
   * Change btnCancel label
   */
  @Input() btnCancel: string = 'Cancel';

  /**
   * Change btnConfirm label
   */
  @Input() btnConfirm: string = 'Confirm';

  /**
   * Event emitted when user change the selected color (without confirm)
   */
  @Output() change = new EventEmitter();

  /**
   * Event emitted when selected color is confirm
   */
  @Output() selected = new EventEmitter();

  /**
   * Event emitted when is clicked outside of the component
   */
  @Output() clickOut = new EventEmitter();

  /**
   * Return a Observable with the color the user is picking
   */
  get tmpSelectedColor$(): Observable<string> {
    return this._tmpSelectedColor.asObservable();
  }
  private _tmpSelectedColor: BehaviorSubject<string>;

  /**
   * Array of subscriptions from the collections
   */
  private _collectionSubs: Subscription[] = [];

  /**
   * Observable with all the colors used by the user
   */
  usedColors$: Observable<string[]>;

  constructor(
    private elementRef: ElementRef,
    private changeDetectorRef: ChangeDetectorRef,
    private colorPickerService: MccColorPickerService,
    @Inject(EMPTY_COLOR) public emptyColor: string
  ) {}

  ngOnInit() {
    if (!this._selectedColor) {
      this._selectedColor = this.emptyColor;
    }

    this.usedColors$ = this.colorPickerService.getColors();
    this._tmpSelectedColor = new BehaviorSubject<string>(this._selectedColor);
  }

  /**
   * Walk throw all collections and subcribe to changes
   */
  ngAfterContentInit() {
    if (this._collections) {
      this._collections.forEach((collection: MccColorPickerCollectionComponent) => {
        const subscription = collection.changeColor.subscribe(color => {
          this.updateTmpSelectedColor(color);
        });

        this._collectionSubs.push(subscription);
      });
    }
  }

  /**
   * Destroy all subscriptions
   */
  ngOnDestroy() {
    if (this._collectionSubs) {
      this._collectionSubs.forEach((subscription: Subscription) => {
        if (subscription && !subscription.closed) {
          subscription.unsubscribe();
        }
      });
    }
  }

  /**
   * Update selected color and emit the change
   */
  private _updateSelectedColor() {
    if (this._isOpen || !this.overlay) {
      const tmpSelectedColor = this._tmpSelectedColor.getValue();
      if (this._selectedColor !== tmpSelectedColor) {
        this._selectedColor = tmpSelectedColor;
        this.selected.next(this._selectedColor);
        //finally emit the changes for updating the origin
        this.change.next(this._selectedColor);
      } else {
        this.selected.emit(this._selectedColor);
      }

    }
  }

  /**
   * Open/close color picker panel
   */
  toggle() {
    this._isOpen = !this._isOpen;
    if (!this._isOpen && this._selectedColor !== this.emptyColor) {
      this.colorPickerService.addColor(this._selectedColor);
    }
  }

  /**
   * Update selected color, close the panel and notify the user
   */
  backdropClick(): void {
    this.confirmSelectedColor();
    this.clickOut.emit(null);
  }

  /**
   * Update tmpSelectedColor
   * @param color string
   */
  updateTmpSelectedColor(color: string) {
    if (color) {
      this._tmpSelectedColor.next(color);

      //bugfix: no emittance till either confirm clicked or hidden buttons
      // this.change.next(color);
      if (this._hideButtons) {
        this._updateSelectedColor();
      }
    }
  }

  /**
   * Cancel the selection and close the panel
   */
  cancelSelection() {
    this.selected.emit(this._selectedColor);
    this.toggle();
  }

  /**
   * Update selectedColor and close the panel
   */
  confirmSelectedColor() {
    this._updateSelectedColor();
    this.toggle();
  }
}
