import { Component, OnInit, Inject, Output, EventEmitter } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { MatLegacyDialogRef as MatDialogRef, MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA } from '@angular/material/legacy-dialog';

@Component({
    selector: 'app-tag-property-edit-fins',
    templateUrl: './tag-property-edit-fins.component.html',
    styleUrls: ['./tag-property-edit-fins.component.scss']
})
export class TagPropertyEditFinsComponent implements OnInit {
    @Output() result = new EventEmitter<any>();
    formGroup: UntypedFormGroup;
    isBoolType = false;
    memoryRanges = {
        'D': { min: 0, max: 32767, name: 'Data Memory' },
        'W': { min: 0, max: 511, name: 'Work' },
        'C': { min: 0, max: 4095, name: 'Counter' },
        'H': { min: 0, max: 511, name: 'Holding' },
        'A': { min: 0, max: 959, name: 'Auxiliary' }
    };

    constructor(
        private fb: UntypedFormBuilder,
        public dialogRef: MatDialogRef<TagPropertyEditFinsComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) {}

    ngOnInit() {
        this.formGroup = this.fb.group({
            deviceName: [{ value: this.data.device?.name || '', disabled: true }],
            tagName: [this.data.tag?.name || '', Validators.required],
            tagMemoryAddress: [this.data.tag?.memaddress || 'D', Validators.required],
            tagType: [this.data.tag?.type || 'Int16', Validators.required],
            tagAddress: [
                this.data.tag?.address || 0,
                [Validators.required, Validators.min(0)]
            ],
            tagAddressBit: [this.data.tag?.bit !== undefined ? this.data.tag.bit : 0],
            tagDivisor: [this.data.tag?.divisor || 1],
            tagDescription: [this.data.tag?.description || '']
        });

        this.isBoolType = this.formGroup.get('tagType')?.value === 'Bool';
        this.updateAddressValidators();
        this.updateBitFieldVisibility();
    }

    onTypeChange() {
        const tagType = this.formGroup.get('tagType')?.value;
        this.isBoolType = tagType === 'Bool';
        this.updateBitFieldVisibility();
        this.updateAddressValidators();
    }

    onMemoryAddressChange() {
        this.updateAddressValidators();
    }

    updateBitFieldVisibility() {
        const tagAddressBitControl = this.formGroup.get('tagAddressBit');
        if (this.isBoolType) {
            tagAddressBitControl?.setValidators([Validators.required, Validators.min(0), Validators.max(15)]);
        } else {
            tagAddressBitControl?.clearValidators();
            tagAddressBitControl?.setValue(null);
        }
        tagAddressBitControl?.updateValueAndValidity();
    }

    updateAddressValidators() {
        const memAddress = this.formGroup.get('tagMemoryAddress')?.value;
        const range = this.memoryRanges[memAddress];

        if (range) {
            const tagAddressControl = this.formGroup.get('tagAddress');
            tagAddressControl?.setValidators([
                Validators.required,
                Validators.min(range.min),
                Validators.max(range.max)
            ]);
            tagAddressControl?.updateValueAndValidity();
        }
    }

    getMinAddress(): number {
        const memAddress = this.formGroup.get('tagMemoryAddress')?.value;
        return this.memoryRanges[memAddress]?.min || 0;
    }

    getMaxAddress(): number {
        const memAddress = this.formGroup.get('tagMemoryAddress')?.value;
        return this.memoryRanges[memAddress]?.max || 32767;
    }

    getAddressPlaceholder(): string {
        const memAddress = this.formGroup.get('tagMemoryAddress')?.value;
        const range = this.memoryRanges[memAddress];
        return range ? `${range.min}-${range.max}` : '0-32767';
    }

    getAddressRangeText(): string {
        const memAddress = this.formGroup.get('tagMemoryAddress')?.value;
        const range = this.memoryRanges[memAddress];
        return range ? `Address must be between ${range.min}-${range.max} for ${range.name}` : '';
    }

    onNoClick(): void {
        this.result.emit();
    }

    onOkClick(): void {
        if (this.formGroup.valid) {
            this.result.emit(this.formGroup.getRawValue());
        }
    }
}
