import { Component, OnInit, Inject, Output, EventEmitter } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA as MAT_DIALOG_DATA, MatDialogRef as MatDialogRef } from '@angular/material/dialog';
import { FinsTagType } from '../../../_models/device';

@Component({
    selector: 'app-tag-property-edit-fins',
    templateUrl: './tag-property-edit-fins.component.html',
    styleUrls: ['./tag-property-edit-fins.component.scss']
})
export class TagPropertyEditFinsComponent implements OnInit {
    @Output() result = new EventEmitter<any>();
    formGroup: UntypedFormGroup;
    isBoolType = false;
    isStringType = false;

    tagTypes = Object.values(FinsTagType);

    memoryRanges: Record<string, { min: number; max: number; name: string }> = {
        'D':   { min: 0, max: 32767, name: 'Data Memory (D)' },
        'W':   { min: 0, max: 511,   name: 'Work Area (W)' },
        'H':   { min: 0, max: 511,   name: 'Holding Bit (H)' },
        'A':   { min: 0, max: 959,   name: 'Auxiliary Bit (A)' },
        'C':   { min: 0, max: 4095,  name: 'Counter (C)' },
        'T':   { min: 0, max: 4095,  name: 'Timer (T)' },
        'CIO': { min: 0, max: 6143,  name: 'CIO Area (CIO)' },
        'EM':  { min: 0, max: 32767, name: 'Extended Memory (EM)' },
        'IR':  { min: 0, max: 15,    name: 'Index Register (IR)' },
        'DR':  { min: 0, max: 15,    name: 'Data Register (DR)' },
        'E0':  { min: 0, max: 32767, name: 'Extended Memory Bank E0' },
        'E1':  { min: 0, max: 32767, name: 'Extended Memory Bank E1' },
        'E2':  { min: 0, max: 32767, name: 'Extended Memory Bank E2' },
        'E3':  { min: 0, max: 32767, name: 'Extended Memory Bank E3' },
        'E4':  { min: 0, max: 32767, name: 'Extended Memory Bank E4' },
        'E5':  { min: 0, max: 32767, name: 'Extended Memory Bank E5' },
        'E6':  { min: 0, max: 32767, name: 'Extended Memory Bank E6' },
        'E7':  { min: 0, max: 32767, name: 'Extended Memory Bank E7' },
        'E8':  { min: 0, max: 32767, name: 'Extended Memory Bank E8' },
        'E9':  { min: 0, max: 32767, name: 'Extended Memory Bank E9' },
        'EA':  { min: 0, max: 32767, name: 'Extended Memory Bank EA' },
        'EB':  { min: 0, max: 32767, name: 'Extended Memory Bank EB' },
        'EC':  { min: 0, max: 32767, name: 'Extended Memory Bank EC' },
        'EE':  { min: 0, max: 32767, name: 'Extended Memory Bank EE' },
        'EF':  { min: 0, max: 32767, name: 'Extended Memory Bank EF' },
        'E10': { min: 0, max: 32767, name: 'Extended Memory Bank E10' },
        'E11': { min: 0, max: 32767, name: 'Extended Memory Bank E11' },
        'E12': { min: 0, max: 32767, name: 'Extended Memory Bank E12' },
        'E13': { min: 0, max: 32767, name: 'Extended Memory Bank E13' },
        'E14': { min: 0, max: 32767, name: 'Extended Memory Bank E14' },
        'E15': { min: 0, max: 32767, name: 'Extended Memory Bank E15' },
        'E16': { min: 0, max: 32767, name: 'Extended Memory Bank E16' },
        'E17': { min: 0, max: 32767, name: 'Extended Memory Bank E17' },
        'E18': { min: 0, max: 32767, name: 'Extended Memory Bank E18' },
    };

    constructor(
        private fb: UntypedFormBuilder,
        public dialogRef: MatDialogRef<TagPropertyEditFinsComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) {}

    ngOnInit() {
        const type = this.data.tag?.type || FinsTagType.Int16;
        this.formGroup = this.fb.group({
            deviceName:      [{ value: this.data.device?.name || '', disabled: true }],
            tagName:         [this.data.tag?.name || '', Validators.required],
            tagMemoryAddress:[this.data.tag?.memaddress || 'D', Validators.required],
            tagType:         [type, Validators.required],
            tagAddress:      [this.data.tag?.address ?? 0, [Validators.required, Validators.min(0)]],
            tagAddressBit:   [this.data.tag?.bit ?? 0],
            tagStringLength: [this.data.tag?.format ?? 20, [Validators.required, Validators.min(1), Validators.max(256)]],
            tagDescription:  [this.data.tag?.description || '']
        });

        this.updateTypeFlags(type);
        this.updateAddressValidators();
        this.updateBitFieldValidators();
    }

    onTypeChange() {
        const type = this.formGroup.get('tagType')?.value;
        this.updateTypeFlags(type);
        this.updateBitFieldValidators();
        this.updateAddressValidators();
    }

    onMemoryAddressChange() {
        this.updateAddressValidators();
    }

    private updateTypeFlags(type: string) {
        this.isBoolType   = type === FinsTagType.Bool;
        this.isStringType = type === FinsTagType.String;
    }

    private updateBitFieldValidators() {
        const ctrl = this.formGroup.get('tagAddressBit');
        if (this.isBoolType) {
            ctrl?.setValidators([Validators.required, Validators.min(0), Validators.max(15)]);
        } else {
            ctrl?.clearValidators();
            ctrl?.setValue(null);
        }
        ctrl?.updateValueAndValidity();
    }

    updateAddressValidators() {
        const memAddress = this.formGroup.get('tagMemoryAddress')?.value;
        const range = this.memoryRanges[memAddress];
        const ctrl = this.formGroup.get('tagAddress');
        if (range && ctrl) {
            ctrl.setValidators([Validators.required, Validators.min(range.min), Validators.max(range.max)]);
            ctrl.updateValueAndValidity();
        }
    }

    getMinAddress(): number {
        return this.memoryRanges[this.formGroup.get('tagMemoryAddress')?.value]?.min ?? 0;
    }

    getMaxAddress(): number {
        return this.memoryRanges[this.formGroup.get('tagMemoryAddress')?.value]?.max ?? 32767;
    }

    getAddressPlaceholder(): string {
        const range = this.memoryRanges[this.formGroup.get('tagMemoryAddress')?.value];
        return range ? `${range.min}-${range.max}` : '0-32767';
    }

    getAddressRangeText(): string {
        const key = this.formGroup.get('tagMemoryAddress')?.value;
        const range = this.memoryRanges[key];
        return range ? `${range.min}–${range.max} (${range.name})` : '';
    }

    onNoClick(): void { this.result.emit(); }

    onOkClick(): void {
        if (this.formGroup.valid) {
            this.result.emit(this.formGroup.getRawValue());
        }
    }
}
